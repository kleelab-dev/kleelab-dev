"""Application settings loaded from environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration required by the Phase 1 application foundation."""

    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    STRIPE_SECRET_KEY: str | None = None
    STRIPE_WEBHOOK_SECRET: str | None = None
    SENTRY_DSN: str | None = None
    AWS_ACCESS_KEY_ID: str | None = None
    AWS_SECRET_ACCESS_KEY: str | None = None
    AWS_REGION: str = "us-east-1"
    AWS_S3_BUCKET: str | None = None
    CLOUDFRONT_DISTRIBUTION_ID: str | None = None
    STRIPE_PRICE_PRO: str | None = None
    STRIPE_PRICE_BUSINESS: str | None = None
    RESEND_API_KEY: str | None = None
    SENDGRID_FROM_EMAIL: str = "noreply@kleelab.com"
    SLACK_WEBHOOK_URL: str | None = None

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[3] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()