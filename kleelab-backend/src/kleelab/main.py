"""FastAPI application entry point."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

try:
    import sentry_sdk
except ImportError:  # pragma: no cover - dependency is installed in production
    sentry_sdk = None

from kleelab.core.database import engine
from kleelab.core.exceptions import register_exception_handlers
from kleelab.core.logging import RequestLoggingMiddleware, configure_logging
from kleelab.core.middleware import RateLimitMiddleware
from kleelab.core.security_headers import SecurityHeadersMiddleware
from kleelab.core.config import settings
from kleelab.routers.auth import router as auth_router
from kleelab.routers.agency import router as agency_router
from kleelab.routers.ai import router as ai_router
from kleelab.routers.analytics import router as analytics_router
from kleelab.routers.assets import router as assets_router
from kleelab.routers.dashboard import router as dashboard_router
from kleelab.routers.gdpr import router as gdpr_router
from kleelab.routers.pages import router as pages_router
from kleelab.routers.products import router as products_router
from kleelab.routers.orders import router as orders_router
from kleelab.routers.public import router as public_router
from kleelab.routers.seo import router as seo_router
from kleelab.routers.sites import router as sites_router
from kleelab.routers.storefront import router as storefront_router
from kleelab.routers.templates import router as templates_router
from kleelab.routers.versions import router as versions_router
from kleelab.services import llm


configure_logging()
logger = logging.getLogger(__name__)
if sentry_sdk is not None and settings.SENTRY_DSN:
    sentry_sdk.init(dsn=settings.SENTRY_DSN, traces_sample_rate=0.1)

# Say so out loud. The AI builder fails closed, which is right, but "switched off"
# and "broken" look identical from the interface: the start page simply offers a
# blank page and a customer has no way to tell what happened. A line in the log at
# boot is the difference between a two-minute fix and an afternoon spent reading
# code — and `.env` overrides the code defaults, so this is the only place that
# reports what the running process actually believes.
if not llm.available():
    logger.warning(
        "AI site builder is OFF: AI_ENABLED=%s, provider keys configured=%s. "
        "/api/ai/* will refuse with 503 ai_not_configured. Set AI_ENABLED=true and "
        "DEEPSEEK_API_KEY (and optionally GEMINI_API_KEY) in kleelab-backend/.env "
        "(and in the host's environment for a deployed instance) to switch it on.",
        settings.AI_ENABLED,
        ",".join(llm.configured_providers()) or "none",
    )
else:
    # Names every live provider rather than one, so "running on one instead of
    # two" is visible at boot instead of being inferred from a slow first build.
    logger.info(
        "AI site builder is on. Providers: %s. First choice per pass: brief=%s, "
        "content=%s, edit=%s.",
        ", ".join(llm.configured_providers()),
        llm.preferred_model("brief"),
        llm.preferred_model("content"),
        llm.preferred_model("edit"),
    )

# The other switch that changes what the product will do to someone, and the more
# dangerous one to leave on by accident: publishing normally requires a verified
# email, and this turns that off. It exists so the publish-and-view path is usable
# without a mail provider, which is a development need only.
if settings.AUTO_VERIFY_EMAILS:
    level = logger.warning if settings.ENVIRONMENT != "development" else logger.info
    level(
        "Email verification is OFF (AUTO_VERIFY_EMAILS=true), so any account can "
        "publish without confirming its address. This is intended for local "
        "development; set AUTO_VERIFY_EMAILS=false outside it.",
    )

app = FastAPI(title="KleeLab API", version="1.0.0")
register_exception_handlers(app)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(RateLimitMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # Built from SITES_DOMAIN, because a published site's own origin cannot be
    # listed: there is one per customer, and a shop's cart calls this API from it.
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Added last so it is the outermost layer, meaning headers are present even on
# responses produced by the rate limiter or CORS preflight.
app.add_middleware(SecurityHeadersMiddleware)
app.include_router(auth_router)
app.include_router(agency_router)
app.include_router(ai_router)
app.include_router(assets_router)
app.include_router(analytics_router)
app.include_router(dashboard_router)
app.include_router(gdpr_router)
app.include_router(sites_router)
app.include_router(pages_router)
app.include_router(products_router)
app.include_router(public_router)
app.include_router(orders_router)
app.include_router(seo_router)
app.include_router(storefront_router)
app.include_router(templates_router)
app.include_router(versions_router)


@app.get("/")
async def root() -> dict[str, str]:
    """Return the API identity."""

    return {"message": "KleeLab API v1"}


@app.get("/health")
async def health() -> dict[str, str]:
    """Report API and database availability."""

    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Health check database connection failed")
        return {"status": "degraded", "database": "disconnected"}
    return {"status": "ok", "database": "connected"}