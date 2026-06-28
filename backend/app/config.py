from functools import lru_cache
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
