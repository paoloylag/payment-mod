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
from payment_module.models import (  # noqa: E402
    AuthSession,
    DocumentRequirementRule,
    FinanceConfiguration,
    PaymentRequest,
    SystemSetting,
)


@pytest.fixture(autouse=True)
def remove_records_created_by_test():
    """Clean transaction fixtures and restore Finance policy/settings after each test."""
    with SessionLocal() as db:
        existing_session_ids = set(db.scalars(select(AuthSession.id)))
        existing_request_ids = set(db.scalars(select(PaymentRequest.id)))
        existing_document_rule_ids = set(db.scalars(select(DocumentRequirementRule.id)))
        existing_finance_config_ids = set(db.scalars(select(FinanceConfiguration.id)))
        finance_settings = {
            row.key: (row.id, row.value)
            for row in db.scalars(select(SystemSetting).where(SystemSetting.key.like("finance.%")))
        }
    yield
    with SessionLocal.begin() as db:
        session_delete = delete(AuthSession)
        request_delete = delete(PaymentRequest)
        rule_delete = delete(DocumentRequirementRule)
        if existing_session_ids:
            session_delete = session_delete.where(AuthSession.id.not_in(existing_session_ids))
        if existing_request_ids:
            request_delete = request_delete.where(PaymentRequest.id.not_in(existing_request_ids))
        if existing_document_rule_ids:
            rule_delete = rule_delete.where(DocumentRequirementRule.id.not_in(existing_document_rule_ids))
        db.execute(session_delete)
        db.execute(request_delete)
        db.execute(rule_delete)
        config_delete = delete(FinanceConfiguration)
        if existing_finance_config_ids:
            config_delete = config_delete.where(FinanceConfiguration.id.not_in(existing_finance_config_ids))
        db.execute(config_delete)
        for row in db.scalars(select(SystemSetting).where(SystemSetting.key.like("finance.%"))):
            if row.key not in finance_settings:
                db.delete(row)
        for key, (setting_id, value) in finance_settings.items():
            row = db.get(SystemSetting, setting_id)
            if row is None:
                db.add(SystemSetting(id=setting_id, key=key, value=value))
            else:
                row.value = value


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client
