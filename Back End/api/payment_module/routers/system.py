from fastapi import APIRouter, Response, status

from ..config import get_settings
from ..database import check_database

settings = get_settings()
router = APIRouter(tags=["system"])


@router.get("/healthz", summary="Liveness check")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz", summary="Readiness check")
def readiness(response: Response) -> dict[str, str]:
    connected, error = check_database()
    if not connected:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    result = {
        "status": "ready" if connected else "unavailable",
        "database": "connected" if connected else "unavailable",
    }
    if error and settings.app_env != "production":
        result["error"] = error
    return result


@router.get("/api", summary="API root")
def api_root() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.app_env,
        "api_prefix": settings.api_prefix,
        "docs": "/docs",
    }


@router.get(f"{settings.api_prefix}/system/status", summary="Application status")
def system_status() -> dict[str, str]:
    connected, _ = check_database()
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.app_env,
        "timezone": settings.database_timezone,
        "database": "connected" if connected else "unavailable",
    }
