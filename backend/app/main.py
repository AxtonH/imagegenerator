from io import BytesIO
import logging
from urllib.parse import urlparse
from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from PIL import Image
import requests
from .auth import create_access_token, get_current_profile, require_admin
from .config import Settings, get_settings
from .gemini_client import GeminiImageClient, get_gemini_client
from .odoo_client import OdooClient, get_odoo_client
from .schemas import (
    AdminUsageResponse,
    GenerateImageRequest,
    GenerationResponse,
    HistoryResponse,
    ImageActionRequest,
    LoginRequest,
    LoginResponse,
    RefineImageRequest,
)
from .supabase_client import SupabaseService, get_supabase_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("prezlab-imagegen")
ALLOWED_UPLOAD_TYPES = {"image/png", "image/jpeg", "image/webp"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

app = FastAPI(title="Prezlab Image Generation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:3003",
        "http://127.0.0.1:3003",
        "http://localhost:3004",
        "http://127.0.0.1:3004",
        "http://localhost:3005",
        "http://127.0.0.1:3005",
    ],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):3[0-9]{3}$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": f"Server error: {exc}"})


@app.post("/auth/login", response_model=LoginResponse)
def login(
    body: LoginRequest,
) -> LoginResponse:
    try:
        settings = get_settings()
    except Exception as exc:
        logger.exception("Login failed while loading settings")
        raise HTTPException(
            status_code=500,
            detail=f"Login failed while loading server configuration: {exc}",
        ) from exc

    try:
        odoo = OdooClient(settings)
        supabase = SupabaseService(settings)
    except Exception as exc:
        logger.exception("Login failed while creating backend clients")
        raise HTTPException(
            status_code=500,
            detail=f"Login failed while creating backend clients: {exc}",
        ) from exc

    try:
        odoo_user = odoo.verify_user(body.email, body.password)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Login failed while verifying Odoo user %s", body.email)
        raise HTTPException(
            status_code=502,
            detail=f"Login failed while verifying Odoo user: {exc}",
        ) from exc

    try:
        profile = supabase.upsert_profile_from_odoo(odoo_user)
        if not profile:
            raise RuntimeError("Supabase returned no profile after upsert")
    except Exception as exc:
        supabase_host = urlparse(settings.supabase_url).netloc or settings.supabase_url
        logger.exception("Login failed while syncing Supabase profile for %s via %s", body.email, supabase_host)
        raise HTTPException(
            status_code=502,
            detail=f"Login failed while syncing Supabase profile via {supabase_host}: {exc}",
        ) from exc

    try:
        supabase.log_event(profile["id"], "login", metadata={"email": profile["email"]})
        token = create_access_token(profile["id"], settings)
        return LoginResponse(access_token=token, profile=profile)
    except Exception as exc:
        logger.exception("Login failed while creating session for %s", body.email)
        raise HTTPException(
            status_code=500,
            detail=f"Login failed while creating session: {exc}",
        ) from exc


@app.get("/auth/me")
def me(profile: dict = Depends(get_current_profile)) -> dict:
    return profile


def run_generation(
    request: GenerateImageRequest,
    profile: dict,
    supabase: SupabaseService,
    gemini: GeminiImageClient,
) -> GenerationResponse:
    user_id = profile["id"]
    supabase.check_and_increment_usage(user_id)
    model = gemini.model_for_mode(request.mode)
    generation = None
    try:
        enhanced_prompt = gemini.enhance_prompt(request.prompt, request.mode, request.aspect_ratio)
        generation = supabase.create_generation(user_id, request, enhanced_prompt, model)
        supabase.log_event(user_id, "generate_image", generation["id"], metadata={"mode": request.mode})
        _, image_bytes = gemini.generate(request.prompt, request.mode, request.aspect_ratio, request.variations)
        images = [supabase.upload_image(user_id, generation["id"], item) for item in image_bytes]
        generation = supabase.complete_generation(generation["id"], "completed")
        supabase.log_cost(user_id, generation["id"], model, generation["estimated_cost"], {"variations": len(images)})
        supabase.log_event(user_id, "generation_success", generation["id"], metadata={"images": len(images)})
        return GenerationResponse(generation=generation, images=images)
    except Exception as exc:
        if generation:
            supabase.complete_generation(generation["id"], "failed", str(exc))
            supabase.log_event(user_id, "generation_failed", generation["id"], metadata={"error": str(exc)})
        raise HTTPException(status_code=500, detail="Image generation failed") from exc


def run_image_edit(
    request: GenerateImageRequest,
    profile: dict,
    supabase: SupabaseService,
    gemini: GeminiImageClient,
    image_bytes: bytes,
    mime_type: str,
    event_metadata: dict | None = None,
) -> GenerationResponse:
    user_id = profile["id"]
    supabase.check_and_increment_usage(user_id)
    model = gemini.model_for_mode(request.mode)
    generation = None
    try:
        enhanced_prompt, image_bytes_list = gemini.edit_image(
            request.prompt,
            request.mode,
            request.aspect_ratio,
            request.variations,
            image_bytes,
            mime_type,
        )
        generation = supabase.create_generation(user_id, request, enhanced_prompt, model)
        supabase.log_event(
            user_id,
            "generate_image",
            generation["id"],
            metadata={"mode": request.mode, **(event_metadata or {})},
        )
        images = [supabase.upload_image(user_id, generation["id"], item) for item in image_bytes_list]
        generation = supabase.complete_generation(generation["id"], "completed")
        supabase.log_cost(user_id, generation["id"], model, generation["estimated_cost"], {"variations": len(images), **(event_metadata or {})})
        supabase.log_event(user_id, "generation_success", generation["id"], metadata={"images": len(images), **(event_metadata or {})})
        return GenerationResponse(generation=generation, images=images)
    except Exception as exc:
        if generation:
            supabase.complete_generation(generation["id"], "failed", str(exc))
            supabase.log_event(user_id, "generation_failed", generation["id"], metadata={"error": str(exc), **(event_metadata or {})})
        raise HTTPException(status_code=500, detail="Image edit failed") from exc


async def read_uploaded_image(file: UploadFile) -> tuple[bytes, str]:
    mime_type = file.content_type or ""
    if mime_type not in ALLOWED_UPLOAD_TYPES:
        raise HTTPException(status_code=415, detail="Upload a PNG, JPEG, or WebP image")
    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Uploaded image is empty")
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Uploaded image must be 10MB or smaller")
    return image_bytes, mime_type


@app.post("/generate-image", response_model=GenerationResponse)
def generate_image(
    body: GenerateImageRequest,
    profile: dict = Depends(get_current_profile),
    supabase: SupabaseService = Depends(get_supabase_service),
    gemini: GeminiImageClient = Depends(get_gemini_client),
) -> GenerationResponse:
    return run_generation(body, profile, supabase, gemini)


@app.post("/edit-image", response_model=GenerationResponse)
async def edit_uploaded_image(
    prompt: str = Form(..., min_length=3, max_length=4000),
    aspect_ratio: str = Form(..., min_length=3, max_length=64),
    variations: int = Form(...),
    mode: str = Form(...),
    image: UploadFile = File(...),
    profile: dict = Depends(get_current_profile),
    supabase: SupabaseService = Depends(get_supabase_service),
    gemini: GeminiImageClient = Depends(get_gemini_client),
) -> GenerationResponse:
    try:
        request = GenerateImageRequest(prompt=prompt, aspect_ratio=aspect_ratio, variations=variations, mode=mode)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    image_bytes, mime_type = await read_uploaded_image(image)
    return run_image_edit(
        request,
        profile,
        supabase,
        gemini,
        image_bytes,
        mime_type,
        {"source": "uploaded_image"},
    )


@app.post("/refine-image", response_model=GenerationResponse)
def refine_image(
    body: RefineImageRequest,
    profile: dict = Depends(get_current_profile),
    supabase: SupabaseService = Depends(get_supabase_service),
    gemini: GeminiImageClient = Depends(get_gemini_client),
) -> GenerationResponse:
    combined = GenerateImageRequest(
        prompt=f"{body.prompt}\nRefinement request: {body.refinement_prompt}",
        aspect_ratio=body.aspect_ratio,
        variations=body.variations,
        mode=body.mode,
    )
    if body.parent_image_id:
        parent_image = supabase.get_image(profile["id"], body.parent_image_id)
        if not parent_image:
            raise HTTPException(status_code=404, detail="Parent image not found")
        source = requests.get(parent_image["image_url"], timeout=30)
        source.raise_for_status()
        mime_type = source.headers.get("content-type", "image/png").split(";")[0]
        result = run_image_edit(
            combined,
            profile,
            supabase,
            gemini,
            source.content,
            mime_type if mime_type in ALLOWED_UPLOAD_TYPES else "image/png",
            {"source": "generated_image_refinement", "parent_image_id": body.parent_image_id},
        )
    else:
        result = run_generation(combined, profile, supabase, gemini)
    supabase.create_refinement(
        profile["id"],
        body.parent_generation_id,
        body.parent_image_id,
        body.refinement_prompt,
        result.generation["id"],
    )
    supabase.log_event(profile["id"], "refine_image", result.generation["id"], body.parent_image_id)
    return result


@app.post("/image-action")
def image_action(
    body: ImageActionRequest,
    profile: dict = Depends(get_current_profile),
    supabase: SupabaseService = Depends(get_supabase_service),
) -> dict:
    image = supabase.image_action(profile["id"], body.image_id, body.action)
    supabase.log_event(profile["id"], body.action, image.get("generation_id"), body.image_id, body.metadata)
    return image


@app.get("/download-image/{image_id}")
def download_image(
    image_id: str,
    format: str = Query("png", pattern="^(png|jpeg|webp)$"),
    profile: dict = Depends(get_current_profile),
    supabase: SupabaseService = Depends(get_supabase_service),
) -> StreamingResponse:
    image = supabase.get_image(profile["id"], image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    source = requests.get(image["image_url"], timeout=30)
    source.raise_for_status()

    original = Image.open(BytesIO(source.content))
    output = BytesIO()
    pil_format = "JPEG" if format == "jpeg" else format.upper()
    if pil_format == "JPEG":
      original = original.convert("RGB")
    original.save(output, format=pil_format, quality=92)
    output.seek(0)

    updated = supabase.increment_download(profile["id"], image)
    filename = f"prezlab-{updated['id']}.{format}"
    return StreamingResponse(
        output,
        media_type=f"image/{format}",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/history", response_model=HistoryResponse)
def history(
    profile: dict = Depends(get_current_profile),
    supabase: SupabaseService = Depends(get_supabase_service),
) -> HistoryResponse:
    return HistoryResponse(generations=supabase.history(profile["id"]))


@app.get("/admin/usage", response_model=AdminUsageResponse)
def admin_usage(
    profile: dict = Depends(require_admin),
    supabase: SupabaseService = Depends(get_supabase_service),
) -> dict:
    return supabase.admin_usage(profile["id"])
