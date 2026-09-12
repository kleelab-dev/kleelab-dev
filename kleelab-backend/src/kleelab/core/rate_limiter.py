"""Per-client rate limiting.

Uses a shared Redis store when `REDIS_URL` is configured so limits hold across
instances. Otherwise it falls back to an in-process sliding window, which is
correct for a single worker but should not be relied on in production.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from kleelab.core.config import settings

logger = logging.getLogger(__name__)

# Endpoints that get the stricter per-minute budget.
AUTH_PATHS = {"/api/auth/login", "/api/auth/register", "/api/auth/refresh"}

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


class RedisStore:
    """Fixed-window counters shared across instances."""

    def __init__(self, url: str) -> None:
        self._url = url
        self._client = None

    async def _connection(self):
        if self._client is None:
            # Imported lazily so the dependency stays optional.
            import redis.asyncio as redis  # type: ignore[import-not-found]

            self._client = redis.from_url(self._url, decode_responses=True)
        return self._client

    async def allow(self, key: str, limit: int, window: float) -> tuple[bool, int]:
        client = await self._connection()
        bucket = int(time.time() // window)
        redis_key = f"rl:{key}:{bucket}"

        count = await client.incr(redis_key)
        if count == 1:
            await client.expire(redis_key, int(window) + 1)

        if count > limit:
            ttl = await client.ttl(redis_key)
            return False, max(int(ttl), 1)
        return True, 0


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Apply a strict budget to auth traffic and a looser one everywhere else."""

    def __init__(self, app, limit: int | None = None, window_seconds: int = 3600) -> None:
        super().__init__(app)
        self.limit = limit if limit is not None else settings.RATE_LIMIT_PER_HOUR
        self.window_seconds = window_seconds
        self._memory = MemoryStore()
        self._redis: RedisStore | None = (
            RedisStore(settings.REDIS_URL) if settings.REDIS_URL else None
        )
        if self._redis is None:
            logger.info(
                "Rate limiting is in-process only; set REDIS_URL to share limits "
                "across instances."
            )

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        is_auth = path in AUTH_PATHS
        if is_auth:
            limit, window = settings.AUTH_RATE_LIMIT_PER_MINUTE, 60.0
        else:
            limit, window = self.limit, float(self.window_seconds)

        key = f"{client_ip(request)}:{'auth' if is_auth else 'general'}"

        allowed, retry_after = True, 0
        if self._redis is not None:
            try:
                allowed, retry_after = await self._redis.allow(key, limit, window)
            except Exception:  # noqa: BLE001 - never fail closed on a store outage
                logger.exception("Shared rate-limit store failed; using in-process limits")
                allowed, retry_after = self._memory.allow(key, limit, window)
        else:
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
