from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Payment Module API"
    app_version: str = "0.1.0"
    app_env: Literal["local", "test", "staging", "production"] = "local"
    api_prefix: str = "/api/v1"
    log_level: str = "INFO"
    database_url: str = "postgresql+psycopg://payment_module:payment_module@127.0.0.1:5434/payment_module"
    database_timezone: str = "Asia/Manila"
    cors_origins: str = "http://127.0.0.1:5175,http://localhost:5175"
    session_cookie_name: str = "aps_session"
    session_idle_minutes: int = 60
    session_absolute_hours: int = 8
    session_cookie_secure: bool = False
    session_cleanup_enabled: bool = False
    session_cleanup_retention_days: int = 30
    session_cleanup_batch_size: int = 1000
    development_demo_password: str | None = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
