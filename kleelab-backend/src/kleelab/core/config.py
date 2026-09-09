"""Application settings loaded from environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration required by the Phase 1 application foundation."""

    DATABASE_URL: str
    SECRET_KEY: str
    CORS_ORIGINS: str = "http://localhost:3000"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    SENTRY_DSN: str | None = None
    RESEND_API_KEY: str | None = None
    SENDGRID_FROM_EMAIL: str = "noreply@kleelab.com"
    SLACK_WEBHOOK_URL: str | None = None

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[3] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

# Render provides PostgreSQL URLs as postgres://; asyncpg expects an explicit driver.
for database_prefix in ("postgresql+psycopg2://", "postgresql://", "postgres://"):
    if settings.DATABASE_URL.startswith(database_prefix):
        settings.DATABASE_URL = settings.DATABASE_URL.replace(database_prefix, "postgresql+asyncpg://", 1)
        break