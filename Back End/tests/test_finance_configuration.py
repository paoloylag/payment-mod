from datetime import timedelta
from uuid import UUID, uuid4

import pytest
from payment_module.database import SessionLocal
from payment_module.finance_readiness import finance_date
from payment_module.models import (
    ChartAccount,
    FinanceCodingSnapshot,
    FinanceConfiguration,
    PaymentRequest,
    SystemSetting,
    TaxCode,
)
from sqlalchemy import delete, select
from test_payment_requests import login, payload_for_type, seed


@pytest.fixture()
def configuration_fixture():
    seed()
    body = payload_for_type("general")
    with SessionLocal.begin() as db:
        before_requests = set(db.scalars(select(PaymentRequest.id)))
        before_configs = set(db.scalars(select(FinanceConfiguration.id)))
        setting = db.scalar(select(SystemSetting).where(SystemSetting.key == "finance.setup.draft"))
        original = setting.value if setting else None
        db.execute(delete(SystemSetting).where(SystemSetting.key == "finance.setup.draft"))
        credit = ChartAccount(
            code=f"C-{uuid4().hex[:8]}",
            name=f"Payable {uuid4().hex[:8]}",
            account_type="liability",
            is_posting=True,
            normal_balance="credit",
        )
        db.add(credit)
        db.flush()
        credit_id = credit.id
        tax_id = db.scalar(select(TaxCode.id).where(TaxCode.code == "VAT12-EWT2"))
    config = {
        "version": 0,
        "vat_basis": "inclusive",
        "ewt_basis": "net_of_vat",
        "rounding": "half_up",
        "effective_date_basis": "finance_review",
        "effective_from": finance_date().isoformat(),
        "setup_scope": "request_type",
        "tax_by_request_type": {"general": str(tax_id)},
        "accounts_by_request_type": {
            "general": {"debit_account_id": body["lines"][0]["chart_account_id"], "credit_account_id": str(credit_id)}
        },
    }
    yield config, body
    with SessionLocal.begin() as db:
        db.execute(delete(PaymentRequest).where(PaymentRequest.id.not_in(before_requests)))
        db.execute(delete(FinanceConfiguration).where(FinanceConfiguration.id.not_in(before_configs)))
        db.execute(delete(ChartAccount).where(ChartAccount.id == credit_id))
        db.execute(delete(SystemSetting).where(SystemSetting.key == "finance.setup.draft"))
        if original is not None:
            db.add(SystemSetting(key="finance.setup.draft", value=original))


def save_setup(client, headers, config):
    response = client.put("/api/v1/request-settings/finance-setup", json=config, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def activate(client, headers, version=1, previous=0, key=None, reason="Finance approved General configuration"):
    return client.post(
        "/api/v1/request-settings/finance-setup/activate",
        headers={**headers, "Idempotency-Key": key or str(uuid4())},
        json={"draft_version": version, "expected_previous_version": previous, "reason": reason},
    )


def test_activation_permissions_completeness_versions_and_idempotency(client, configuration_fixture):
    config, body = configuration_fixture
    manager = login(client, "finance.manager@payment.local")
    incomplete = save_setup(client, manager, {"version": 0})
    assert incomplete["activation"]["blockers"]
    assert activate(client, manager).status_code == 409
    saved = save_setup(client, manager, {**config, "version": 1})
    assert not saved["activation"]["blockers"]
    associate = login(client, "finance.associate@payment.local")
    assert activate(client, associate, 2).status_code == 403
    manager = login(client, "finance.manager@payment.local")
    assert activate(client, manager, 1).status_code == 409
    key = str(uuid4())
    result = activate(client, manager, 2, key=key)
    assert result.status_code == 200, result.text
    assert result.json()["activation"]["active"]["version"] == 2
    assert activate(client, manager, 2, key=key).status_code == 200
    assert activate(client, manager, 2, key=key, reason="Changed").status_code == 409
    assert activate(client, manager, 2, previous=2).status_code == 409


def test_automatic_coding_pins_config_and_draft_edits_do_not_apply(client, configuration_fixture):
    config, body = configuration_fixture
    manager = login(client, "finance.manager@payment.local")
    save_setup(client, manager, config)
    assert activate(client, manager).status_code == 200
    owner = login(client)
    body["lines"][0]["chart_account_id"] = None
    body["lines"][0]["cost_center_id"] = None
    response = client.post("/api/v1/requests", json=body, headers=owner)
    assert response.status_code == 201, response.text
    item = response.json()
    assert item["lines"][0]["chart_account_id"] == config["accounts_by_request_type"]["general"]["debit_account_id"]
    assert item["lines"][0]["cost_center_id"]
    submitted = client.post(
        f"/api/v1/requests/{item['id']}/submit", json={"version": 1}, headers={**owner, "Idempotency-Key": str(uuid4())}
    )
    assert submitted.status_code == 200, submitted.text
    original = client.get(f"/api/v1/finance-tax/{item['id']}").json()
    assert original["coding"]["configuration_version"] == 1
    manager = login(client, "finance.manager@payment.local")
    changed = save_setup(client, manager, {**config, "version": 1, "rounding": "half_even"})
    assert changed["activation"]["active"]["version"] == 1
    assert activate(client, manager, 2, 1).status_code == 200
    owner = login(client)
    after = client.get(f"/api/v1/finance-tax/{item['id']}").json()
    assert after["coding"] == original["coding"]
    assert after["preview"]["configuration"]["rounding"] == "half_up"
    new_request = client.post("/api/v1/requests", json=body, headers=owner).json()
    with SessionLocal() as db:
        coding = db.scalar(
            select(FinanceCodingSnapshot).where(FinanceCodingSnapshot.request_id == UUID(new_request["id"]))
        )
        assert coding.result["configuration_version"] == 2


def test_invalidated_accounts_block_creation_and_submission(client, configuration_fixture):
    config, body = configuration_fixture
    manager = login(client, "finance.manager@payment.local")
    save_setup(client, manager, config)
    assert activate(client, manager).status_code == 200
    owner = login(client)
    draft = client.post("/api/v1/requests", json=body, headers=owner).json()
    account_id = UUID(config["accounts_by_request_type"]["general"]["debit_account_id"])
    with SessionLocal.begin() as db:
        db.get(ChartAccount, account_id).is_posting = False
    try:
        assert client.post("/api/v1/requests", json=body, headers=owner).status_code == 409
        blocked = client.post(
            f"/api/v1/requests/{draft['id']}/submit",
            json={"version": 1},
            headers={**owner, "Idempotency-Key": str(uuid4())},
        )
        assert blocked.status_code == 409
        with SessionLocal() as db:
            assert db.get(PaymentRequest, UUID(draft["id"])).status == "draft"
    finally:
        with SessionLocal.begin() as db:
            db.get(ChartAccount, account_id).is_posting = True


def test_future_activation_blocks_until_effective(client, configuration_fixture):
    config, body = configuration_fixture
    manager = login(client, "finance.manager@payment.local")
    config["effective_from"] = (finance_date() + timedelta(days=2)).isoformat()
    save_setup(client, manager, config)
    response = activate(client, manager)
    assert response.status_code == 200, response.text
    assert response.json()["activation"]["active"] is None
    owner = login(client)
    blocked = client.post("/api/v1/requests", json=body, headers=owner)
    assert blocked.status_code == 409
    assert "not yet effective" in blocked.text
