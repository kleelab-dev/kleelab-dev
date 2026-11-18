"""Consistent API exception handlers."""

import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError


logger = logging.getLogger(__name__)


class PaymentError(Exception):
    """An online payment refused for a reason the client should be told plainly.

    Carries its own code ("payments_disabled", "not_payable", ...) so the page
    can tell "online payment is switched off" from "this is already paid".
    """

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def register_exception_handlers(app: FastAPI) -> None:
    """Register consistent handlers for expected API failures."""

    @app.exception_handler(PaymentError)
    async def payment_error_handler(request: Request, exc: PaymentError) -> JSONResponse:
        del request
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
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
        # A validator that raises ValueError leaves the exception itself in the
        # error's context, which json cannot encode: say it as text instead of
        # turning a 422 into a 500.
        details = jsonable_encoder(exc.errors(), custom_encoder={Exception: str})
        return JSONResponse(
            status_code=422,
            content={"error": {"code": "validation_error", "message": "Invalid request", "details": details}},
        )

    @app.exception_handler(SQLAlchemyError)
    async def database_exception_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        del request
        logger.exception("Database error", exc_info=exc)
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "database_error", "message": "Database operation failed"}},
        )