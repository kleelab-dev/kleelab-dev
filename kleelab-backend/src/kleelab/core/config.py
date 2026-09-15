"""Application settings loaded from environment variables."""

import re
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
    # The domain customer sites live under, so a published site is reachable at
    # `{subdomain}.{SITES_DOMAIN}`. Empty means sites are served from paths on
    # FRONTEND_URL instead, which is what local development needs — the frontend's
    # request proxy only rewrites a subdomain host when the request has one, and
    # `localhost:3000` never does.
    SITES_DOMAIN: str = ""
    ALGORITHM: str = "HS256"
    # Short-lived access tokens, refreshed via rotating refresh tokens.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    # Honour X-Forwarded-For / X-Real-IP. Required behind a load balancer, where
    # request.client.host is the proxy and every caller would share one bucket.
    TRUST_PROXY: bool = True
    # Optional shared rate-limit store. Without it limits are per-process.
    REDIS_URL: str | None = None
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

    # --- AI site builder -------------------------------------------------------
    # Fails closed. Everything AI-related is refused with a clear 503 until this
    # is explicitly switched on with a key present, so a missing or rotated
    # credential degrades to an honest message rather than a traceback on a
    # customer's first impression of the product.
    AI_ENABLED: bool = False
    # DeepSeek speaks the OpenAI chat-completions dialect, so this is a base URL
    # rather than a provider name. Swapping provider is a config change plus
    # whatever `services/llm.py` needs, not a rewrite.
    DEEPSEEK_API_KEY: str | None = None
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    DEEPSEEK_MODEL: str = "deepseek-chat"
    # Google Gemini, reached through its OpenAI-compatible endpoint. Same dialect,
    # different host, so the provider registry in `services/llm.py` treats the two
    # identically and adding a third is another entry rather than another client.
    # Either key alone is sufficient: each pass names the providers it prefers and
    # falls back to the other, so the split is an optimisation, not a dependency.
    GEMINI_API_KEY: str | None = None
    GEMINI_BASE_URL: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    GEMINI_MODEL: str = "gemini-2.5-pro"
    # A brief is a small answer; a page of copy is a large one. 60s is generous
    # for both and still short enough that a stalled request cannot hold a worker
    # for minutes.
    AI_TIMEOUT_SECONDS: float = 60.0
    AI_MAX_OUTPUT_TOKENS: int = 4000
    # Bounds one request's cost and prompt size. The section list is supplied by
    # the client, so it is also the main shape a malicious caller could abuse.
    AI_MAX_SECTIONS_PER_REQUEST: int = 12
    AI_MAX_PROMPT_CHARS: int = 2000
    # Fills empty image slots with real photographs, because a page of empty
    # frames is what makes a generated site look dead. These are Unsplash-sourced
    # placeholders chosen by a stable seed and they are not necessarily about the
    # business — see `services/stock_images.py`. Turn this off and the slots fall
    # back to a designed placeholder instead.
    STOCK_IMAGES_ENABLED: bool = True
    STOCK_IMAGE_BASE_URL: str = "https://picsum.photos"
    STOCK_IMAGE_WIDTH: int = 1400
    STOCK_IMAGE_HEIGHT: int = 1000

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[3] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        """CORS origins parsed from the comma-separated setting."""

        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def cors_origin_regex(self) -> str:
        """Origins that cannot be listed, because there are unboundedly many of them.

        A published site lives at `{subdomain}.{SITES_DOMAIN}` and calls this API from
        the browser — a shop's cart, for one. Every customer therefore has an origin no
        static list can contain, and without a pattern here their site loads and then
        silently fails every request it makes: CORS refuses it, and the browser console
        says nothing an owner could act on.

        Built rather than written out, so the domain is configured in one place. An
        empty `SITES_DOMAIN` contributes nothing, which is right for local development
        where sites are served from paths on localhost.
        """

        patterns = [
            r"https://[a-z0-9-]+\.onrender\.com",
            r"http://(localhost|127\.0\.0\.1)(:\d+)?",
        ]

        domain = self.SITES_DOMAIN.strip().lower().lstrip(".")
        if domain:
            # `[a-z0-9-]+` rather than `.*`: a subdomain cannot contain a dot, and
            # allowing one would let a host that merely ends with the domain — or one
            # containing it, like `kleelab.com.evil.test` — present itself as a site.
            patterns.append(rf"https://[a-z0-9-]+\.{re.escape(domain)}")
            patterns.append(rf"https://{re.escape(domain)}")

        return "|".join(patterns)


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