"""Consistent API exception handlers."""

import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError


logger = logging.getLogger(__name__)


class PlanLimitError(Exception):
    """A request refused because the account's plan does not allow it.

    Deliberately not an ``HTTPException``. The generic handler collapses a detail
    payload into a string, and this needs to arrive as structured data: the
    interface has to tell the difference between "you ran out of sites" (offer an
    upgrade) and "something went wrong" (offer a retry), and a sentence it has to
    pattern-match on cannot do that reliably.
    """

    def __init__(
        self,
        *,
        resource: str,
        limit: int,
        current: int,
        plan: str,
        message: str,
        retryable_tomorrow: bool = False,
    ) -> None:
        super().__init__(message)
        self.resource = resource
        self.limit = limit
        self.current = current
        self.plan = plan
        self.message = message
        self.retryable_tomorrow = retryable_tomorrow


class AIUnavailableError(Exception):
    """The AI builder cannot serve this request.

    A separate type from a plain 503 so the interface can say something specific
    — "the AI builder is switched off" or "the model returned something unusable"
    — rather than a generic failure. Those are different sentences to a customer,
    and only one of them is worth retrying.
    """

    def __init__(
        self, message: str, *, code: str = "ai_unavailable", retryable: bool = True
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.retryable = retryable


def register_exception_handlers(app: FastAPI) -> None:
    """Register consistent handlers for expected API failures."""

    @app.exception_handler(AIUnavailableError)
    async def ai_unavailable_handler(request: Request, exc: AIUnavailableError) -> JSONResponse:
        del request
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": {"retryable": exc.retryable},
                }
            },
        )

    @app.exception_handler(PlanLimitError)
    async def plan_limit_handler(request: Request, exc: PlanLimitError) -> JSONResponse:
        del request
        details: dict[str, Any] = {
            "resource": exc.resource,
            "limit": exc.limit,
            "current": exc.current,
            "plan": exc.plan,
            "upgradePath": "/builder/upgrade",
        }
        if exc.retryable_tomorrow:
            details["retryableTomorrow"] = True
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={
                "error": {
                    "code": "plan_limit",
                    "message": exc.message,
                    "details": details,
                }
            },
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        del request
        return JSONResponse(
            status_code=exc.status_code,
            headers=exc.headers,
            content={"error": {"code": "http_error", "message": str(exc.detail)}},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        del request
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "validation_error", "message": "Invalid request", "details": exc.errors()}},
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_exception_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        del request
        logger.exception("Database error", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "database_error", "message": "Database operation failed"}},
        )