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
    # The team dashboard (kleelab-admin). Password reset links for staff accounts
    # point here so a staff reset never goes through the public site. Unset falls
    # back to FRONTEND_URL.
    ADMIN_URL: str | None = None
    ALGORITHM: str = "HS256"
    # Short-lived access tokens, refreshed via rotating refresh tokens.
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    # Retention promised on the privacy page; services/retention.py enforces both.
    # Enquiries that never became a project are deleted after this many days.
    ENQUIRY_RETENTION_DAYS: int = 730
    # Invoices outlive a deleted account for tax records, then go after this long.
    INVOICE_RETENTION_YEARS: int = 6
    # Honour X-Forwarded-For / X-Real-IP. Required behind a load balancer, where
    # request.client.host is the proxy and every caller would share one bucket.
    TRUST_PROXY: bool = True
    # Login/signup requests allowed per IP per minute. Keep this generous enough that a
    # few failed attempts during development cannot lock the API out.
    AUTH_RATE_LIMIT_PER_MINUTE: int = 20
    # Requests allowed per IP per hour for every other route.
    RATE_LIMIT_PER_HOUR: int = 1000
    # Messages per IP per hour to the visitor enquiry chat.
    CHAT_RATE_LIMIT_PER_HOUR: int = 60
    SQL_ECHO: bool = False
    SENTRY_DSN: str | None = None
    # Mailtrap Email Sending API token. Used first when set; Resend is the fallback.
    MAILTRAP_API_TOKEN: str | None = None
    RESEND_API_KEY: str | None = None
    SENDGRID_FROM_EMAIL: str = "noreply@kleelab.com"
    SLACK_WEBHOOK_URL: str | None = None
    # Where enquiries, client messages and sign-offs are sent. Falls back to the
    # sending address when unset, which is what this did before it existed.
    TEAM_INBOX: str | None = None
    # Where a reply to an email sent from the team dashboard goes, e.g.
    # info@kleelab.com. Falls back to TEAM_INBOX.
    REPLY_TO_EMAIL: str | None = None
    # Printed on invoice PDFs. Lines are separated by "\n" (or real line breaks).
    # The address under "From", and how to pay by bank transfer. Both optional.
    INVOICE_FROM_ADDRESS: str | None = None
    INVOICE_PAYMENT_DETAILS: str | None = None
    # Paystack card payments for invoices. Off until a secret key is set: the
    # "Pay now" button disappears and the payment routes answer 503. Use a test
    # key (sk_test_...) until the live account is approved. The same key signs
    # webhooks, so there is no separate webhook secret.
    PAYSTACK_SECRET_KEY: str | None = None
    PAYSTACK_BASE_URL: str = "https://api.paystack.co"
    # Where Paystack sends the client after paying. Unset means
    # {FRONTEND_URL}/dashboard/payment, the client site's return page.
    PAYSTACK_CALLBACK_URL: str | None = None
    PAYSTACK_TIMEOUT_SECONDS: float = 20.0
    # Cloudinary credential, supplied in the conventional URI form:
    # cloudinary://<api_key>:<api_secret>@<cloud_name>
    CLOUDINARY_URL: str | None = None
    CLOUDINARY_FOLDER: str = "kleelab"
    # Upload guard rails for site media.
    MAX_UPLOAD_BYTES: int = 5 * 1024 * 1024
    # Shared with the client site (its REVALIDATE_SECRET), so portfolio changes
    # show there at once. Unset, the site picks them up within five minutes.
    REVALIDATE_SECRET: str | None = None

    # --- AI (the visitor enquiry chat) ----------------------------------------
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

    # Free first calls, booked from the site (services/calls.py). Times are
    # offered in the team's own time, a fixed offset from UTC: Lagos keeps no
    # daylight saving, so no time-zone database is needed.
    CALL_UTC_OFFSET_MINUTES: int = 60
    CALL_TIMEZONE_LABEL: str = "Lagos time (WAT)"
    # Weekdays, first slot at the start hour, last one ending by the end hour.
    CALL_DAY_START_HOUR: int = 10
    CALL_DAY_END_HOUR: int = 16
    CALL_MINUTES: int = 30
    # A call can be booked this far ahead at the soonest, and at the latest.
    CALL_MIN_NOTICE_HOURS: int = 24
    CALL_BOOKING_DAYS: int = 21
    # The video link every call uses, e.g. a standing Google Meet room. Without
    # it the confirmation says we will send the link before the call.
    MEETING_URL: str | None = None

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[3] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def paystack_enabled(self) -> bool:
        return bool((self.PAYSTACK_SECRET_KEY or "").strip())

    @property
    def paystack_callback_url(self) -> str:
        return self.PAYSTACK_CALLBACK_URL or f"{self.FRONTEND_URL.rstrip('/')}/dashboard/payment"

    @property
    def cors_origins(self) -> list[str]:
        """CORS origins parsed from the comma-separated setting."""

        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    @property
    def cors_origin_regex(self) -> str:
        """Origins allowed by pattern, on top of the `CORS_ORIGINS` list.

        Any `*.onrender.com` host is matched, as before. Localhost on any port is
        allowed only in development, so a page served from someone's own machine
        cannot call a deployed API.
        """

        patterns = [r"https://[a-z0-9-]+\.onrender\.com"]
        if self.ENVIRONMENT == "development":
            patterns.append(r"http://(localhost|127\.0\.0\.1)(:\d+)?")
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