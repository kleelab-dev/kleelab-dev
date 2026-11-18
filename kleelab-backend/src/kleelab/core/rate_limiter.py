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
_missing_header_warned = False


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


def _forwarded_chain(request: Request) -> list[str]:
    # A repeated header is joined so a caller-written first line cannot win.
    forwarded = ", ".join(request.headers.getlist("x-forwarded-for"))
    return [part.strip() for part in forwarded.split(",") if part.strip()]


def _from_chain(chain: list[str]) -> str | None:
    """The entry TRUSTED_PROXY_HOPS places from the end of X-Forwarded-For.

    Each proxy adds the address it was connected from to the end and keeps
    whatever the caller sent in front, so only the last entries are ours. A
    shorter chain means fewer proxies than expected; proxies only add entries,
    so the first is then the nearest one we can trust.
    """

    hops = settings.TRUSTED_PROXY_HOPS
    if hops <= 0 or not chain:
        return None
    return _valid_ip(chain[-hops] if len(chain) >= hops else chain[0])


def _log_chain_once(chain: list[str], header_ip: str) -> None:
    """Log once per process where the trusted header's address sits in the chain.

    Only positions and counts are logged, never an address.
    """

    global _chain_checked
    if _chain_checked:
        return
    _chain_checked = True
    position = next((n for n in range(1, len(chain) + 1) if _valid_ip(chain[-n]) == header_ip), None)
    logger.info(
        "client address check: %s, %d X-Forwarded-For entries, header address is %s from the end",
        settings.CLIENT_IP_HEADER,
        len(chain),
        f"entry {position}" if position else "not in the chain",
    )


def client_ip(request: Request) -> str:
    """The caller's address, read so that the caller cannot choose it.

    Behind a proxy `request.client.host` is the proxy, which would put every
    caller into one bucket, so a forwarded address is used instead:

    1. CLIENT_IP_HEADER, when set, names a header our edge proxy always
       overwrites with the address it saw. On Render that is Cloudflare's
       CF-Connecting-IP. It does not depend on how many proxies follow, and
       the caller cannot set it, because Cloudflare replaces any value sent.
       Only set it when every request passes through that proxy.
    2. Otherwise X-Forwarded-For, read TRUSTED_PROXY_HOPS entries from the end.
       The first entry, which the caller controls, is never used.
    """

    fallback = request.client.host if request.client else "unknown"
    if not settings.TRUST_PROXY:
        return fallback
    chain = _forwarded_chain(request)
    if settings.CLIENT_IP_HEADER:
        header_ip = _valid_ip((request.headers.get(settings.CLIENT_IP_HEADER) or "").strip())
        if header_ip:
            _log_chain_once(chain, header_ip)
            return header_ip
        _warn_missing_header_once()
    return _from_chain(chain) or fallback


def _warn_missing_header_once() -> None:
    """The chain fallback may be a proxy address that changes per request."""

    global _missing_header_warned
    if _missing_header_warned:
        return
    _missing_header_warned = True
    logger.warning(
        "client address check: %s missing or invalid on a request; using X-Forwarded-For instead",
        settings.CLIENT_IP_HEADER,
    )


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
