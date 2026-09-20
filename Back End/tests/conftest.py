import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
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
from payment_module.models import AuthSession  # noqa: E402


@pytest.fixture(autouse=True)
def remove_sessions_created_by_test():
    """Never leave test-created authentication sessions in the configured database."""
    with SessionLocal() as db:
        existing_ids = set(db.scalars(AuthSession.__table__.select().with_only_columns(AuthSession.id)))
    yield
    with SessionLocal.begin() as db:
        query = db.query(AuthSession)
        if existing_ids:
            query = query.filter(AuthSession.id.not_in(existing_ids))
        query.delete(synchronize_session=False)


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client
