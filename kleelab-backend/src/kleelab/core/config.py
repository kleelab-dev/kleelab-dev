"""Application settings loaded from environment variables."""

from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration required by the Phase 1 application foundation."""

    DATABASE_URL: str
    SECRET_KEY: str
    ENVIRONMENT: str = "development"
    CORS_ORIGINS: str = "http://localhost:3000"
    FRONTEND_URL: str = "http://localhost:3000"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    # Login/signup requests allowed per IP per minute. Keep this generous enough that a
    # few failed attempts during development cannot lock the API out.
    AUTH_RATE_LIMIT_PER_MINUTE: int = 20
    # Requests allowed per IP per hour for every other route. The builder autosaves
    # while editing, so this needs enough headroom for a real session.
    RATE_LIMIT_PER_HOUR: int = 1000
    # Development convenience: mark new accounts as email-verified immediately so
    # publishing is testable without a configured mail provider. Never enable this
    # in production.
    AUTO_VERIFY_EMAILS: bool = False
    SQL_ECHO: bool = False
    SENTRY_DSN: str | None = None
    RESEND_API_KEY: str | None = None
    SENDGRID_FROM_EMAIL: str = "noreply@kleelab.com"
    SLACK_WEBHOOK_URL: str | None = None
    # Cloudinary credential, supplied in the conventional URI form:
    # cloudinary://<api_key>:<api_secret>@<cloud_name>
    CLOUDINARY_URL: str | None = None
    CLOUDINARY_FOLDER: str = "kleelab"
    # Upload guard rails for site media.
    MAX_UPLOAD_BYTES: int = 5 * 1024 * 1024

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[3] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        """CORS origins parsed from the comma-separated setting."""

        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()

if "CHANGE_THIS" in settings.SECRET_KEY and settings.ENVIRONMENT != "development":
    raise RuntimeError(
        "SECRET_KEY still holds the placeholder value. Set a long random SECRET_KEY "
        "in the environment before running outside development."
    )


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