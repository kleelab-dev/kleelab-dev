"""Application settings loaded from environment variables."""

from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

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


def normalize_database_url(database_url: str) -> str:
    """Convert Render/Neon PostgreSQL URLs to SQLAlchemy asyncpg URLs."""

    for database_prefix in ("postgresql+psycopg2://", "postgresql://", "postgres://"):
        if database_url.startswith(database_prefix):
            database_url = database_url.replace(database_prefix, "postgresql+asyncpg://", 1)
            break

    parsed = urlsplit(database_url)
    query = []
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        if key == "sslmode":
            key = "ssl"
        elif key == "channel_binding":
            continue
        query.append((key, value))
    return urlunsplit(parsed._replace(query=urlencode(query)))


settings.DATABASE_URL = normalize_database_url(settings.DATABASE_URL)