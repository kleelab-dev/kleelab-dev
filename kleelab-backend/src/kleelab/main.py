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
from kleelab.core.config import settings
from kleelab.routers.auth import router as auth_router
from kleelab.routers.analytics import router as analytics_router
from kleelab.routers.dashboard import router as dashboard_router
from kleelab.routers.gdpr import router as gdpr_router
from kleelab.routers.pages import router as pages_router
from kleelab.routers.products import router as products_router
from kleelab.routers.orders import router as orders_router
from kleelab.routers.seo import router as seo_router
from kleelab.routers.sites import router as sites_router
from kleelab.routers.templates import router as templates_router
from kleelab.routers.versions import router as versions_router


configure_logging()
logger = logging.getLogger(__name__)
if sentry_sdk is not None and settings.SENTRY_DSN:
    sentry_sdk.init(dsn=settings.SENTRY_DSN, traces_sample_rate=0.1)

app = FastAPI(title="KleeLab API", version="1.0.0")
register_exception_handlers(app)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(RateLimitMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"https://[a-z0-9-]+\.onrender\.com|http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router)
app.include_router(analytics_router)
app.include_router(dashboard_router)
app.include_router(gdpr_router)
app.include_router(sites_router)
app.include_router(pages_router)
app.include_router(products_router)
app.include_router(orders_router)
app.include_router(seo_router)
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