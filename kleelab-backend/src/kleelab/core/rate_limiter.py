"""Per-client rate limiting.

An in-process sliding window. The API runs as a single instance, so one
process sees every request; running more than one would need a shared store.
"""

from __future__ import annotations

import ipaddress
import logging
import time
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from kleelab.core.config import settings

logger = logging.getLogger(__name__)
# Set once the proxy chain has been compared with Cloudflare's header (see below).
_chain_checked = False


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


def _valid_ip(value: str) -> str | None:
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        return None


def _check_chain_once(request: Request, chain: list[str], chosen: str) -> None:
    """Log once per process whether the hop count matches Cloudflare's own header.

    CF-Connecting-IP is the address Cloudflare saw. If the address read from the
    chain matches it, TRUSTED_PROXY_HOPS is right. No address is logged.
    """

    global _chain_checked
    cf = request.headers.get("cf-connecting-ip")
    if _chain_checked or not cf:
        return
    _chain_checked = True
    if _valid_ip(cf.strip()) == chosen:
        logger.info("client address check: OK, %d proxy entries, hops=%d", len(chain), settings.TRUSTED_PROXY_HOPS)
    else:
        logger.warning(
            "client address check: MISMATCH, %d proxy entries, hops=%d; TRUSTED_PROXY_HOPS is wrong",
            len(chain),
            settings.TRUSTED_PROXY_HOPS,
        )


def client_ip(request: Request) -> str:
    """The caller's address, read so that the caller cannot choose it.

    Behind a proxy `request.client.host` is the proxy, which would put every
    caller into one bucket, so the forwarded address is used instead. Each proxy
    adds the address it was connected from to the end of X-Forwarded-For and
    keeps whatever the caller sent in front of it. Only the last
    TRUSTED_PROXY_HOPS entries were written by our own proxies, so the address
    is read that many places from the end. The first entry, which the caller
    controls, is never used. On Render the chain is Cloudflare then Render, so
    the setting is 2.
    """

    fallback = request.client.host if request.client else "unknown"
    hops = settings.TRUSTED_PROXY_HOPS
    if not settings.TRUST_PROXY or hops <= 0:
        return fallback
    # A repeated header is joined so a caller-written first line cannot win.
    forwarded = ", ".join(request.headers.getlist("x-forwarded-for"))
    chain = [part.strip() for part in forwarded.split(",") if part.strip()]
    if not chain:
        return fallback
    # A shorter chain means fewer proxies than expected. Proxies only add
    # entries, so the first is then the nearest one we can trust.
    chosen = _valid_ip(chain[-hops] if len(chain) >= hops else chain[0])
    if chosen is None:
        return fallback
    _check_chain_once(request, chain, chosen)
    return chosen


def bucket_key(ip: str) -> str:
    """IPv6 users usually hold a whole /64, so they share one budget per /64."""

    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if isinstance(addr, ipaddress.IPv6Address):
        if addr.ipv4_mapped is not None:
            return str(addr.ipv4_mapped)
        return str(ipaddress.ip_network(f"{addr}/64", strict=False))
    return str(addr)


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

        key = f"{bucket_key(client_ip(request))}:{bucket}"

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
