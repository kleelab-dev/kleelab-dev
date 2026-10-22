"""FastAPI application entry point."""

import asyncio
import logging
from contextlib import asynccontextmanager

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
from kleelab.routers.admin import router as admin_router
from kleelab.routers.team import router as team_router
from kleelab.routers.agency import router as agency_router
from kleelab.routers.auth import router as auth_router
from kleelab.routers.calls import router as calls_router, team_router as calls_team_router
from kleelab.routers.chat import router as chat_router
from kleelab.routers.gdpr import router as gdpr_router
from kleelab.routers.library import router as library_router
from kleelab.routers.care import router as care_router
from kleelab.routers.payments import router as payments_router
from kleelab.routers.projects import router as projects_router
from kleelab.routers.proposals import router as proposals_router, team_router as proposals_team_router
from kleelab.services import billing, llm, retention


configure_logging()
logger = logging.getLogger(__name__)
if sentry_sdk is not None and settings.SENTRY_DSN:
    sentry_sdk.init(dsn=settings.SENTRY_DSN, traces_sample_rate=0.1)

# Say which mode the visitor chat is in. Without a model it still answers from a
# set of written replies, which looks like a working chat, so a missing or
# rotated key would otherwise go unnoticed. `.env` overrides the code defaults,
# so this is the only place that reports what the running process believes.
if not llm.available():
    logger.warning(
        "AI enquiry chat is on written answers only: AI_ENABLED=%s, provider keys "
        "configured=%s. Set AI_ENABLED=true and "
        "DEEPSEEK_API_KEY (and optionally GEMINI_API_KEY) in kleelab-backend/.env "
        "(and in the host's environment for a deployed instance) to switch it on.",
        settings.AI_ENABLED,
        ",".join(llm.configured_providers()) or "none",
    )
else:
    # Names every live provider rather than one, so "running on one instead of
    # two" is visible at boot instead of being inferred from a slow first build.
    logger.info(
        "AI enquiry chat is on. Providers: %s. First choice: %s.",
        ", ".join(llm.configured_providers()),
        llm.preferred_model("chat"),
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

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Deletes old enquiries and invoices, as the privacy page promises.
    task = asyncio.create_task(retention.run_daily())
    # Reminds clients about unpaid invoices around their due date.
    reminders = asyncio.create_task(billing.run_daily())
    yield
    task.cancel()
    reminders.cancel()


app = FastAPI(title="KleeLab API", version="1.0.0", lifespan=lifespan)
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
# The self-serve site builder (sites, pages, products, orders, storefront, AI
# builder) is retired for now: KleeLab builds for clients instead. Its routers are
# no longer mounted, and its tables and data are left untouched.
app.include_router(auth_router)
app.include_router(agency_router)
app.include_router(chat_router)
app.include_router(projects_router)
app.include_router(admin_router)
app.include_router(proposals_router)
app.include_router(proposals_team_router)
app.include_router(calls_router)
app.include_router(calls_team_router)
app.include_router(team_router)
app.include_router(library_router)
app.include_router(care_router)
app.include_router(gdpr_router)
app.include_router(payments_router)


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