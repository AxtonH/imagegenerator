from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, EmailStr, Field


AspectRatio = Literal["16:9", "1:1", "4:5", "9:16"]
GenerationMode = Literal["Fast", "Premium", "Realistic", "Illustration"]
ImageAction = Literal["download_image", "save_image", "favorite_image"]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    profile: dict[str, Any]


class GenerateImageRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=4000)
    aspect_ratio: AspectRatio
    variations: Literal[1, 2, 4]
    mode: GenerationMode


class RefineImageRequest(GenerateImageRequest):
    parent_generation_id: str
    parent_image_id: str | None = None
    refinement_prompt: str = Field(min_length=3, max_length=4000)


class ImageActionRequest(BaseModel):
    image_id: str
    action: ImageAction
    metadata: dict[str, Any] = Field(default_factory=dict)


class GenerationResponse(BaseModel):
    generation: dict[str, Any]
    images: list[dict[str, Any]]


class HistoryResponse(BaseModel):
    generations: list[dict[str, Any]]


class AdminUsageResponse(BaseModel):
    total_users: int
    active_users: int
    total_generations: int
    generations_by_user: list[dict[str, Any]]
    generations_by_department: list[dict[str, Any]]
    failed_generations: int
    estimated_gemini_cost: float
    recent_usage_events: list[dict[str, Any]]
    users_near_limit: list[dict[str, Any]]
