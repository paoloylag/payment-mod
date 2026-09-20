from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


def problem(
    request: Request,
    *,
    status_code: int,
    code: str,
    title: str,
    detail: str,
    errors: list[dict[str, Any]] | None = None,
) -> JSONResponse:
    payload: dict[str, Any] = {
        "type": f"https://payments.local/problems/{code}",
        "title": title,
        "status": status_code,
        "detail": detail,
        "instance": request.url.path,
        "code": code,
        "request_id": getattr(request.state, "request_id", None),
    }
    if errors:
        payload["errors"] = errors
    return JSONResponse(payload, status_code=status_code, media_type="application/problem+json")


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        structured = exc.detail if isinstance(exc.detail, dict) else None
        return problem(
            request,
            status_code=exc.status_code,
            code="http_error",
            title="Request failed",
            detail=str(structured.get("message", "Request failed")) if structured else str(exc.detail),
            errors=structured.get("errors") if structured else None,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception(request: Request, exc: RequestValidationError) -> JSONResponse:
        return problem(
            request,
            status_code=422,
            code="validation_error",
            title="Validation failed",
            detail="The request contains invalid or missing values.",
            errors=exc.errors(),
        )

    @app.exception_handler(Exception)
    async def unexpected_exception(request: Request, _: Exception) -> JSONResponse:
        return problem(
            request,
            status_code=500,
            code="internal_error",
            title="Internal server error",
            detail="The server could not complete the request.",
        )
