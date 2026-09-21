import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.engine import make_url

PROJECT_ROOT = Path(__file__).resolve().parents[1]
API_ROOT = PROJECT_ROOT / "api"
sys.path.insert(0, str(API_ROOT))

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DATABASE_TIMEZONE", "Asia/Manila")
os.environ.setdefault("DEVELOPMENT_DEMO_PASSWORD", "Phase01-Test-Only!")
configured_database_url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL", "")
if not configured_database_url or not (make_url(configured_database_url).database or "").endswith("_test"):
    configured_database_url = "postgresql+psycopg://payment_module:payment_module@127.0.0.1:5434/payment_module_test"
if not (make_url(configured_database_url).database or "").endswith("_test"):
    raise RuntimeError("Automated tests require a dedicated database whose name ends with '_test'")
os.environ["DATABASE_URL"] = configured_database_url

from payment_module.database import SessionLocal  # noqa: E402
from payment_module.main import app  # noqa: E402
from payment_module.models import AuthSession, PaymentRequest  # noqa: E402


@pytest.fixture(autouse=True)
def remove_records_created_by_test():
    """Never leave test-created sessions or payment requests in the test database."""
    with SessionLocal() as db:
        existing_session_ids = set(db.scalars(select(AuthSession.id)))
        existing_request_ids = set(db.scalars(select(PaymentRequest.id)))
    yield
    with SessionLocal.begin() as db:
        session_delete = delete(AuthSession)
        request_delete = delete(PaymentRequest)
        if existing_session_ids:
            session_delete = session_delete.where(AuthSession.id.not_in(existing_session_ids))
        if existing_request_ids:
            request_delete = request_delete.where(PaymentRequest.id.not_in(existing_request_ids))
        db.execute(session_delete)
        db.execute(request_delete)


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client
