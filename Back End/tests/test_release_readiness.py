from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient
from payment_module.database import SessionLocal
from payment_module.main import app
from payment_module.models import User
from payment_module.seed import seed
from sqlalchemy import select

PASSWORD = "Phase01-Test-Only!"


def login(client: TestClient, email: str = "admin@payment.local"):
    return client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})


def test_login_issues_hardened_fresh_session_cookies() -> None:
    seed()
    with TestClient(app) as first, TestClient(app) as second:
        first.cookies.set("aps_session", "attacker-controlled-session", domain="testserver.local", path="/")
        first_response = login(first)
        second_response = login(second)

        assert first_response.status_code == second_response.status_code == 200
        assert first.cookies.get("aps_session") != "attacker-controlled-session"
        assert first.cookies.get("aps_session") != second.cookies.get("aps_session")

        session_cookie = first_response.headers.get_list("set-cookie")[0].lower()
        assert "httponly" in session_cookie
        assert "samesite=lax" in session_cookie
        assert "path=/" in session_cookie


def test_concurrent_logins_create_independent_valid_sessions() -> None:
    seed()

    def authenticate() -> tuple[int, str, int]:
        with TestClient(app) as client:
            response = login(client)
            token = client.cookies.get("aps_session")
            session_status = client.get("/api/v1/auth/session").status_code
            return response.status_code, token, session_status

    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda _: authenticate(), range(4)))

    assert all(status == 200 and session_status == 200 for status, _, session_status in results)
    assert len({token for _, token, _ in results}) == 4


def test_suspension_revokes_all_concurrent_sessions() -> None:
    seed()
    email = "requestor@payment.local"
    with TestClient(app) as first, TestClient(app) as second, TestClient(app) as admin:
        assert login(first, email).status_code == 200
        assert login(second, email).status_code == 200
        admin_login = login(admin)
        assert admin_login.status_code == 200

        with SessionLocal() as db:
            user = db.scalar(select(User).where(User.email == email))

        suspended = admin.patch(
            f"/api/v1/users/{user.id}",
            json={"is_suspended": True},
            headers={"X-CSRF-Token": admin_login.json()["csrf_token"]},
        )
        assert suspended.status_code == 200
        assert first.get("/api/v1/auth/session").status_code == 401
        assert second.get("/api/v1/auth/session").status_code == 401

        restored = admin.patch(
            f"/api/v1/users/{user.id}",
            json={"is_suspended": False},
            headers={"X-CSRF-Token": admin_login.json()["csrf_token"]},
        )
        assert restored.status_code == 200
