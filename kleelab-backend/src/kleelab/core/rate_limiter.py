"""Simple in-memory per-IP rate limiting."""

from collections import defaultdict, deque
from time import monotonic

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Allow a strict limit for login/signup traffic and a looser default for authenticated routes."""

    def __init__(self, app, limit: int = 100, window_seconds: int = 3600):
        super().__init__(app)
        self.limit = limit
        self.window_seconds = window_seconds
        self.requests: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        if path in {"/api/auth/login", "/api/auth/register"}:
            limit = 8
            window_seconds = 60
        else:
            limit = self.limit
            window_seconds = self.window_seconds

        client_ip = request.client.host if request.client else "unknown"
        now = monotonic()
        request_times = self.requests[client_ip]
        while request_times and now - request_times[0] >= window_seconds:
            request_times.popleft()

        if len(request_times) >= limit:
            return JSONResponse(
                status_code=429,
                content={"error": {"code": "rate_limit_exceeded", "message": "Too many requests"}},
            )
        request_times.append(now)

        # Periodically clear IPs with no recent activity so the dict does not grow forever.
        # This runs independently of the current request's own entry, which was just updated above.
        stale_ips = [ip for ip, times in self.requests.items() if not times and ip != client_ip]
        for ip in stale_ips:
            self.requests.pop(ip, None)

        return await call_next(request)