from functools import lru_cache
import re
from typing import Any
from urllib.parse import unquote, urlparse
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Prezlab Image Generation"
    environment: str = "development"
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 12

    supabase_url: str
    supabase_service_role_key: str
    supabase_storage_bucket: str = "generated-images"

    gemini_api_key: str
    gemini_model_fast: str = "gemini-2.5-flash-image"
    gemini_model_premium: str = "gemini-3-pro-image"
    gemini_model_realistic: str = "gemini-3-pro-image"
    gemini_model_illustration: str = "gemini-2.5-flash-image"

    odoo_url: str
    odoo_db: str
    odoo_username: str = ""
    odoo_api_key: str = ""

    cors_allowed_origins: str = ""

    default_monthly_generation_limit: int = 100

    @field_validator("supabase_url", mode="before")
    @classmethod
    def normalize_supabase_url(cls, value: Any) -> str:
        url = cls._clean_url(value)
        supabase_host = re.search(r"([a-z0-9-]+\.supabase\.co)", url, re.IGNORECASE)
        if supabase_host:
            return f"https://{supabase_host.group(1).lower()}"
        if url and not url.startswith(("http://", "https://")):
            url = f"https://{url}"
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            return url
        return f"{parsed.scheme}://{parsed.netloc}"

    @field_validator("odoo_url", mode="before")
    @classmethod
    def normalize_odoo_url(cls, value: Any) -> str:
        return cls._clean_url(value).rstrip("/")

    @staticmethod
    def _clean_url(value: Any) -> str:
        url = unquote(str(value or "")).strip().strip("<>").strip().strip('"').strip("'")
        if "](" in url and url.endswith(")"):
            url = url.split("](", 1)[1].rstrip(")")
        return url.strip().strip("<>").strip().strip('"').strip("'")

    @property
    def cors_origins(self) -> list[str]:
        defaults = [
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
        ]
        configured = [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]
        return defaults + configured

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


@lru_cache
def get_settings() -> Settings:
    return Settings()
