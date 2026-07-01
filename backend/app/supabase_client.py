from datetime import datetime, timezone
from uuid import uuid4
from fastapi import Depends, HTTPException, status
from supabase import Client, create_client
from .config import Settings, get_settings


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SupabaseService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client: Client = create_client(settings.supabase_url, settings.supabase_service_role_key)

    def get_profile(self, user_id: str) -> dict | None:
        response = self.client.table("profiles").select("*").eq("id", user_id).maybe_single().execute()
        return response.data if response else None

    def upsert_profile_from_odoo(self, odoo_user) -> dict:
        existing_response = (
            self.client.table("profiles")
            .select("*")
            .eq("odoo_user_id", odoo_user.odoo_user_id)
            .maybe_single()
            .execute()
        )
        existing = existing_response.data if existing_response else None
        profile_id = existing["id"] if existing else str(uuid4())
        payload = {
            "id": profile_id,
            "odoo_user_id": odoo_user.odoo_user_id,
            "odoo_employee_id": odoo_user.odoo_employee_id,
            "full_name": odoo_user.full_name,
            "email": odoo_user.email,
            "department": odoo_user.department,
            "job_title": odoo_user.job_title,
            "role": existing.get("role", "user") if existing else "user",
            "is_active": odoo_user.is_active,
            "last_login_at": now_iso(),
        }
        self.client.table("profiles").upsert(payload).execute()
        self.ensure_usage_limit(profile_id)
        return self.get_profile(profile_id)

    def log_event(self, user_id: str, event_type: str, generation_id: str | None = None, image_id: str | None = None, metadata: dict | None = None) -> None:
        self.client.table("usage_events").insert({
            "user_id": user_id,
            "event_type": event_type,
            "generation_id": generation_id,
            "image_id": image_id,
            "metadata": metadata or {},
        }).execute()

    def current_month(self) -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m")

    def ensure_usage_limit(self, user_id: str) -> dict:
        month = self.current_month()
        existing_response = (
            self.client.table("usage_limits")
            .select("*")
            .eq("user_id", user_id)
            .eq("month", month)
            .maybe_single()
            .execute()
        )
        existing = existing_response.data if existing_response else None
        if existing:
            return existing
        payload = {
            "user_id": user_id,
            "monthly_generation_limit": self.settings.default_monthly_generation_limit,
            "current_month_generation_count": 0,
            "month": month,
            "updated_at": now_iso(),
        }
        self.client.table("usage_limits").insert(payload).execute()
        return self.ensure_usage_limit(user_id)

    def check_and_increment_usage(self, user_id: str) -> dict:
        usage = self.ensure_usage_limit(user_id)
        if usage["current_month_generation_count"] >= usage["monthly_generation_limit"]:
            self.log_event(user_id, "usage_limit_reached", metadata={"month": usage["month"]})
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Monthly generation limit reached")
        updated = {
            "current_month_generation_count": usage["current_month_generation_count"] + 1,
            "updated_at": now_iso(),
        }
        self.client.table("usage_limits").update(updated).eq("id", usage["id"]).execute()
        return {**usage, **updated}

    def create_generation(self, user_id: str, request, enhanced_prompt: str, model: str) -> dict:
        payload = {
            "user_id": user_id,
            "original_prompt": request.prompt,
            "enhanced_prompt": enhanced_prompt,
            "mode": request.mode,
            "aspect_ratio": request.aspect_ratio,
            "number_of_variations": request.variations,
            "provider": "gemini",
            "model": model,
            "status": "processing",
            "estimated_cost": self.estimate_cost(request.mode, request.variations),
        }
        return self.client.table("generations").insert(payload).execute().data[0]

    def complete_generation(self, generation_id: str, status_value: str, error_message: str | None = None) -> dict:
        payload = {"status": status_value, "completed_at": now_iso(), "error_message": error_message}
        return self.client.table("generations").update(payload).eq("id", generation_id).execute().data[0]

    def upload_image(self, user_id: str, generation_id: str, image_bytes: bytes) -> dict:
        image_id = str(uuid4())
        storage_path = f"{user_id}/{generation_id}/{image_id}.png"
        self.client.storage.from_(self.settings.supabase_storage_bucket).upload(
            storage_path,
            image_bytes,
            {"content-type": "image/png", "upsert": "false"},
        )
        public = self.client.storage.from_(self.settings.supabase_storage_bucket).get_public_url(storage_path)
        payload = {
            "id": image_id,
            "generation_id": generation_id,
            "user_id": user_id,
            "image_url": public,
            "storage_path": storage_path,
            "is_saved": True,
        }
        return self.client.table("generated_images").insert(payload).execute().data[0]

    def log_cost(self, user_id: str, generation_id: str, model: str, estimated_cost: float, metadata: dict | None = None) -> None:
        self.client.table("api_cost_logs").insert({
            "user_id": user_id,
            "generation_id": generation_id,
            "provider": "gemini",
            "model": model,
            "estimated_cost": estimated_cost,
            "metadata": metadata or {},
        }).execute()

    def create_refinement(self, user_id: str, parent_generation_id: str, parent_image_id: str | None, refinement_prompt: str, new_generation_id: str) -> None:
        self.client.table("refinement_history").insert({
            "user_id": user_id,
            "parent_generation_id": parent_generation_id,
            "parent_image_id": parent_image_id,
            "refinement_prompt": refinement_prompt,
            "new_generation_id": new_generation_id,
        }).execute()

    def image_action(self, user_id: str, image_id: str, action: str) -> dict:
        update = {}
        if action == "save_image":
            update["is_saved"] = True
        elif action == "favorite_image":
            update["is_favorite"] = True
        elif action == "download_image":
            image = self.client.table("generated_images").select("downloaded_count").eq("id", image_id).eq("user_id", user_id).single().execute().data
            update["downloaded_count"] = int(image.get("downloaded_count") or 0) + 1
        return self.client.table("generated_images").update(update).eq("id", image_id).eq("user_id", user_id).execute().data[0]

    def get_image(self, user_id: str, image_id: str) -> dict | None:
        response = (
            self.client.table("generated_images")
            .select("*")
            .eq("id", image_id)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        return response.data if response else None

    def increment_download(self, user_id: str, image: dict) -> dict:
        updated = (
            self.client.table("generated_images")
            .update({"downloaded_count": int(image.get("downloaded_count") or 0) + 1})
            .eq("id", image["id"])
            .eq("user_id", user_id)
            .execute()
            .data[0]
        )
        self.log_event(user_id, "download_image", image.get("generation_id"), image["id"])
        return updated

    def history(self, user_id: str) -> list[dict]:
        generations = (
            self.client.table("generations")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
            .data
        )
        images = (
            self.client.table("generated_images")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
            .data
        )
        images_by_generation: dict[str, list[dict]] = {}
        for image in images:
            images_by_generation.setdefault(image["generation_id"], []).append(image)
        for generation in generations:
            generation["generated_images"] = images_by_generation.get(generation["id"], [])
        try:
            self.log_event(user_id, "view_history")
        except Exception:
            pass
        return generations

    def admin_usage(self, user_id: str) -> dict:
        self.log_event(user_id, "view_admin_dashboard")
        profiles = self.client.table("profiles").select("*").execute().data
        generations = self.client.table("generations").select("*, profiles(full_name, department, email)").execute().data
        costs = self.client.table("api_cost_logs").select("estimated_cost").execute().data
        events = self.client.table("usage_events").select("*, profiles(full_name, email)").order("created_at", desc=True).limit(25).execute().data
        limits = self.client.table("usage_limits").select("*, profiles(full_name, email)").execute().data

        by_user: dict[str, dict] = {}
        by_department: dict[str, int] = {}
        for generation in generations:
            profile = generation.get("profiles") or {}
            label = profile.get("email") or generation["user_id"]
            by_user.setdefault(label, {"user": profile.get("full_name") or label, "email": label, "count": 0})
            by_user[label]["count"] += 1
            department = profile.get("department") or "Unknown"
            by_department[department] = by_department.get(department, 0) + 1

        near_limit = [
            limit for limit in limits
            if limit.get("monthly_generation_limit") and limit.get("current_month_generation_count", 0) / limit["monthly_generation_limit"] >= 0.8
        ]

        return {
            "total_users": len(profiles),
            "active_users": len([p for p in profiles if p.get("is_active")]),
            "total_generations": len(generations),
            "generations_by_user": sorted(by_user.values(), key=lambda item: item["count"], reverse=True),
            "generations_by_department": [{"department": key, "count": value} for key, value in sorted(by_department.items())],
            "failed_generations": len([g for g in generations if g.get("status") == "failed"]),
            "estimated_gemini_cost": sum(float(row.get("estimated_cost") or 0) for row in costs),
            "recent_usage_events": events,
            "users_near_limit": near_limit,
        }

    def estimate_cost(self, mode: str, variations: int) -> float:
        base = {"Fast": 0.03, "Premium": 0.08, "Realistic": 0.08, "Illustration": 0.04}[mode]
        return round(base * variations, 4)


def get_supabase_service(settings: Settings = Depends(get_settings)) -> SupabaseService:
    return SupabaseService(settings)
