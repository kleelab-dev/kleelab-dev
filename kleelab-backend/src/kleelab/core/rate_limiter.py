"""Per-client rate limiting.

An in-process sliding window. The API runs as a single instance, so one
process sees every request; running more than one would need a shared store.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from kleelab.core.config import settings


# Endpoints that get the stricter per-minute budget.
AUTH_PATHS = {
    "/api/auth/login",
    "/api/auth/refresh",
    "/api/auth/staff-login",
    "/api/auth/staff-login/two-step",
    "/api/auth/request-password-reset",
    "/api/auth/reset-password",
    "/api/auth/change-password",
    "/api/auth/two-step/setup",
    "/api/auth/two-step/enable",
    "/api/auth/two-step/disable",
    "/api/auth/two-step/recovery-codes",
    # Public forms that need no account: enquiries and free-call bookings.
    "/api/agency/leads",
    "/api/calls",
}
# The visitor chat calls a paid model on every message and needs no account, so
# it gets its own, much smaller hourly budget.
CHAT_PATHS = {"/api/chat"}

DEFAULT_MAX_TRACKED_CLIENTS = 10_000


def client_ip(request: Request) -> str:
    """Best-effort client address, honouring proxy headers when trusted.

    Behind a load balancer `request.client.host` is the proxy, which would put
    every caller into one bucket, so the forwarded address is preferred.
    """

    if settings.TRUST_PROXY:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        real = request.headers.get("x-real-ip")
        if real:
            return real.strip()
    return request.client.host if request.client else "unknown"


class MemoryStore:
    """Sliding window held in process memory."""

    def __init__(self, max_clients: int = DEFAULT_MAX_TRACKED_CLIENTS) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._max_clients = max_clients

    def allow(self, key: str, limit: int, window: float) -> tuple[bool, int]:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] >= window:
            hits.popleft()

        if len(hits) >= limit:
            retry_after = int(window - (now - hits[0])) + 1
            return False, max(retry_after, 1)

        hits.append(now)
        self._evict_stale(now, window)
        return True, 0

    def _evict_stale(self, now: float, window: float) -> None:
        """Drop idle clients so the dict cannot grow without bound."""

        if len(self._hits) <= self._max_clients:
            return
        for key in [k for k, v in self._hits.items() if not v or now - v[-1] >= window]:
            self._hits.pop(key, None)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Apply a strict budget to auth traffic and a looser one everywhere else."""

    def __init__(self, app, limit: int | None = None, window_seconds: int = 3600) -> None:
        super().__init__(app)
        self.limit = limit if limit is not None else settings.RATE_LIMIT_PER_HOUR
        self.window_seconds = window_seconds
        self._memory = MemoryStore()

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        is_auth = path in AUTH_PATHS
        if is_auth:
            limit, window, bucket = settings.AUTH_RATE_LIMIT_PER_MINUTE, 60.0, "auth"
        elif path in CHAT_PATHS:
            limit, window, bucket = settings.CHAT_RATE_LIMIT_PER_HOUR, 3600.0, "chat"
        else:
            limit, window, bucket = self.limit, float(self.window_seconds), "general"

        key = f"{client_ip(request)}:{bucket}"

        allowed, retry_after = self._memory.allow(key, limit, window)

        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "error": {
                        "code": "rate_limit_exceeded",
                        "message": "Too many requests",
                    }
                },
                headers={"Retry-After": str(retry_after)},
            )

        return await call_next(request)
