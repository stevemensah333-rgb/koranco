from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["development", "test", "production"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="KORANCO_",
        extra="ignore",
    )

    environment: Environment
    database_url: str = Field(min_length=1)
    cors_origins: list[str] = Field(default_factory=list)
    csrf_trusted_origins: list[str] = Field(default_factory=list)
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    session_ttl_hours: int = Field(default=12, ge=1, le=168)
    login_failure_limit: int = Field(default=5, ge=2, le=20)
    login_failure_window_minutes: int = Field(default=15, ge=1, le=60)

    @field_validator("database_url")
    @classmethod
    def require_postgresql(cls, value: str) -> str:
        if not value.startswith(("postgresql://", "postgresql+psycopg://")):
            raise ValueError("database_url must use PostgreSQL with psycopg")
        return value

    @field_validator("cors_origins")
    @classmethod
    def reject_wildcard_cors(cls, value: list[str]) -> list[str]:
        if "*" in value:
            raise ValueError("wildcard CORS origins are not allowed")
        return value

    @field_validator("csrf_trusted_origins")
    @classmethod
    def require_explicit_csrf_origins(cls, value: list[str]) -> list[str]:
        if not value or "*" in value:
            raise ValueError("csrf_trusted_origins must contain explicit origins")
        return value

    @property
    def expose_api_docs(self) -> bool:
        return self.environment != "production"

    @property
    def secure_cookies(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
