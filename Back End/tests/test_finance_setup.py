from uuid import uuid4

import pytest
from payment_module.database import SessionLocal
from payment_module.models import ChartAccount, SystemSetting, TaxCode
from payment_module.seed import seed
from sqlalchemy import delete, select


def login(client, role):
    result = client.post(
        "/api/v1/auth/login",
        json={
            "email": f"{role}@payment.local",
            "password": "Phase01-Test-Only!",
        },
    )
    assert result.status_code == 200
    return {"X-CSRF-Token": result.json()["csrf_token"]}


@pytest.fixture()
def empty_setup():
    seed()
    with SessionLocal.begin() as db:
        db.execute(delete(SystemSetting).where(SystemSetting.key == "finance.setup.draft"))
    yield
    with SessionLocal.begin() as db:
        db.execute(delete(SystemSetting).where(SystemSetting.key == "finance.setup.draft"))


def test_partial_setup_persists_and_rejects_stale_updates(client, empty_setup):
    headers = login(client, "finance.manager")
    initial = client.get("/api/v1/request-settings/finance-setup").json()
    assert initial["version"] == 0
    assert not initial["configuration_complete"]
    assert "VAT basis" in initial["missing_choices"]
    payload = {"version": 0, "vat_basis": "inclusive", "voucher": {"prefix": "PV"}}
    saved = client.put("/api/v1/request-settings/finance-setup", headers=headers, json=payload)
    assert saved.status_code == 200
    assert saved.json()["version"] == 1
    assert saved.json()["operational_status"] == "draft"
    assert not saved.json()["configuration_complete"]
    assert client.get("/api/v1/request-settings/finance-setup").json()["vat_basis"] == "inclusive"
    assert client.put("/api/v1/request-settings/finance-setup", headers=headers, json=payload).status_code == 409


def test_setup_permissions_and_invalid_references(client, empty_setup):
    headers = login(client, "finance.associate")
    assert client.get("/api/v1/request-settings/finance-setup").status_code == 200
    assert client.put("/api/v1/request-settings/finance-setup", headers=headers, json={}).status_code == 403
    headers = login(client, "finance.manager")
    for payload in (
        {"tax_by_request_type": {"general": str(uuid4())}},
        {"accounts_by_request_type": {"general": {"debit_account_id": str(uuid4())}}},
        {"tax_by_request_type": {"unknown": None}},
    ):
        assert client.put("/api/v1/request-settings/finance-setup", headers=headers, json=payload).status_code == 422


def test_complete_choices_remain_draft(client, empty_setup):
    headers = login(client, "finance.manager")
    with SessionLocal() as db:
        tax_id = str(db.scalar(select(TaxCode.id).where(TaxCode.is_active.is_(True))))
        account_id = str(
            db.scalar(
                select(ChartAccount.id).where(ChartAccount.is_active.is_(True), ChartAccount.is_posting.is_(True))
            )
        )
    types = ("reimbursement", "cashAdvance", "liquidation", "poPayment", "general")
    payload = {
        "vat_basis": "inclusive",
        "ewt_basis": "net_of_vat",
        "rounding": "half_up",
        "effective_date_basis": "submission",
        "effective_from": "2026-10-13",
        "setup_scope": "system",
        "tax_by_request_type": {key: tax_id for key in types},
        "accounts_by_request_type": {
            key: {"debit_account_id": account_id, "credit_account_id": account_id} for key in types
        },
        "voucher": {
            "prefix": "PV",
            "reset_basis": "academic_year",
            "certification_text": "Reviewed by Finance.",
            "create_role": "finance_associate",
            "post_role": "finance_manager",
            "void_role": "finance_manager",
        },
    }
    result = client.put("/api/v1/request-settings/finance-setup", headers=headers, json=payload)
    assert result.status_code == 200
    assert result.json()["configuration_complete"]
    assert result.json()["missing_choices"] == []
    assert result.json()["operational_status"] == "draft"
