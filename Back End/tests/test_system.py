from payment_module.database import engine
from sqlalchemy import text


def test_liveness_returns_request_id(client) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["X-Request-ID"]


def test_readiness_requires_database(client) -> None:
    response = client.get("/readyz")
    assert response.status_code == 200
    assert response.json()["database"] == "connected"


def test_api_root_describes_versioned_api(client) -> None:
    response = client.get("/api")
    assert response.status_code == 200
    assert response.json()["api_prefix"] == "/api/v1"
    assert response.json()["docs"] == "/docs"


def test_system_status_uses_philippine_timezone(client) -> None:
    response = client.get("/api/v1/system/status")
    assert response.status_code == 200
    assert response.json()["timezone"] == "Asia/Manila"

    with engine.connect() as connection:
        timezone = connection.scalar(text("SHOW TIME ZONE"))
    assert timezone == "Asia/Manila"


def test_not_found_uses_problem_details(client) -> None:
    response = client.get("/missing")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "http_error"
    assert response.json()["request_id"]
