from datetime import timedelta
from uuid import UUID

import pytest
from payment_module.database import SessionLocal
from payment_module.finance_readiness import finance_date, readiness_report
from payment_module.models import ChartAccount, CostCenter, PaymentRequest, TaxCode
from payment_module.routers.finance_setup import REQUEST_TYPES, AccountMapping, FinanceSetupDraft
from payment_module.routers.requests import submission_validation_errors
from sqlalchemy import select
from test_payment_requests import login, payload, seed


def test_readiness_rechecks_expired_and_disabled_saved_references(client):
    seed()
    with SessionLocal() as db:
        tax = db.scalar(select(TaxCode).where(TaxCode.is_active.is_(True)))
        account = db.scalar(select(ChartAccount).where(ChartAccount.is_posting.is_(True)))
        draft = FinanceSetupDraft(
            effective_from=finance_date(),
            tax_by_request_type={key: tax.id for key in REQUEST_TYPES},
            accounts_by_request_type={
                key: AccountMapping(debit_account_id=account.id, credit_account_id=account.id) for key in REQUEST_TYPES
            },
        )
        tax.effective_to = finance_date() - timedelta(days=1)
        account.is_active = False
        report = readiness_report(db, draft, [], REQUEST_TYPES)
        checks = {check["code"]: check for check in report["checks"]}
        assert checks["general.tax"]["status"] == "blocked"
        assert checks["general.debit"]["status"] == "blocked"
        assert checks["general.accounts_distinct"]["status"] == "blocked"
        assert checks["activation"]["status"] == "pending_confirmation"
        assert not report["ready"] and not report["enforced"]
        db.rollback()


@pytest.mark.parametrize("invalid", ["expired_account", "nonposting_account", "future_center", "wrong_department"])
def test_invalid_master_data_blocks_request_creation(client, invalid):
    seed()
    headers = login(client)
    body = payload()
    with SessionLocal.begin() as db:
        if "account" in invalid:
            record = db.get(ChartAccount, UUID(body["lines"][0]["chart_account_id"]))
            field = "effective_to" if invalid == "expired_account" else "is_posting"
            value = finance_date() - timedelta(days=1) if field == "effective_to" else False
        else:
            record = db.get(CostCenter, UUID(body["lines"][0]["cost_center_id"]))
            field = "effective_from" if invalid == "future_center" else "department_id"
            value = (
                finance_date() + timedelta(days=1)
                if field == "effective_from"
                else db.scalar(select(CostCenter.department_id).where(CostCenter.department_id != record.department_id))
            )
            # Use the other department's existing center rather than violating its unique mapping.
            if invalid == "wrong_department":
                body["lines"][0]["cost_center_id"] = str(
                    db.scalar(select(CostCenter.id).where(CostCenter.department_id == value))
                )
                value = record.department_id
        record_id, model, original = record.id, type(record), getattr(record, field)
        setattr(record, field, value)
    try:
        result = client.post("/api/v1/requests", headers=headers, json=body)
        assert result.status_code == 422, result.text
    finally:
        with SessionLocal.begin() as db:
            setattr(db.get(model, record_id), field, original)


def test_submission_rechecks_master_data_after_draft_creation(client):
    seed()
    headers = login(client)
    body = payload()
    created = client.post("/api/v1/requests", headers=headers, json=body)
    assert created.status_code == 201, created.text
    with SessionLocal() as db:
        account = db.get(ChartAccount, UUID(body["lines"][0]["chart_account_id"]))
        account.is_posting = False
        item = db.get(PaymentRequest, UUID(created.json()["id"]))
        errors = submission_validation_errors(db, item)
        assert any(error["field"] == "lines.0.chart_account_id" for error in errors)
        db.rollback()


def test_finance_setup_exposes_live_readiness(client):
    seed()
    login(client, "finance.associate@payment.local")
    response = client.get("/api/v1/request-settings/finance-setup")
    assert response.status_code == 200
    report = response.json()["readiness"]
    assert report["as_of"] == finance_date().isoformat()
    assert report["configuration_version"] == response.json()["version"]
    assert report["pending_confirmation_count"] == 1
