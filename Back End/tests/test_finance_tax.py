import json
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from payment_module.database import SessionLocal
from payment_module.finance_tax import calculate
from payment_module.finance_validation import validation_summary
from payment_module.models import FinanceTaxSnapshot, PaymentRequest, PaymentRequestLine, SystemSetting, TaxCode
from payment_module.seed import seed
from sqlalchemy import delete, func, select
from test_finance_validation import advance_to_finance, login, submitted_request


@pytest.fixture()
def setup_tax():
    seed()
    with SessionLocal.begin() as db:
        codes = {tax.code: str(tax.id) for tax in db.scalars(select(TaxCode))}
        setting = db.scalar(select(SystemSetting).where(SystemSetting.key == "finance.setup.draft"))
        original = setting.value if setting else None
        config = {
            "version": 9,
            "vat_basis": "inclusive",
            "ewt_basis": "net_of_vat",
            "rounding": "half_up",
            "effective_from": "2020-01-01",
            "effective_date_basis": "finance_review",
            "tax_by_request_type": {"general": codes["VAT12-EWT2"]},
        }
        if not setting:
            setting = SystemSetting(key="finance.setup.draft", value="{}")
            db.add(setting)
        setting.value = json.dumps(config)
    yield codes
    with SessionLocal.begin() as db:
        setting = db.scalar(select(SystemSetting).where(SystemSetting.key == "finance.setup.draft"))
        if original is None:
            db.execute(delete(SystemSetting).where(SystemSetting.key == "finance.setup.draft"))
        else:
            setting.value = original


def save(client, request_id, headers, body, key=None):
    return client.post(
        f"/api/v1/finance-tax/{request_id}", json=body, headers={**headers, "Idempotency-Key": key or str(uuid4())}
    )


def test_request_defaults_line_override_no_ewt_and_immutable_history(client, setup_tax):
    request_id, line_id = submitted_request()
    with SessionLocal.begin() as db:
        item = db.get(PaymentRequest, request_id)
        item.gross_amount = Decimal("2240")
        db.get(PaymentRequestLine, line_id).amount = Decimal("1120")
        second = PaymentRequestLine(
            request_id=request_id, position=2, particulars="Second line", amount=Decimal("1120"), currency_code="PHP"
        )
        db.add(second)
        db.flush()
        second_id = str(second.id)
    advance_to_finance(client, request_id)
    headers = login(client, "finance.associate@payment.local")
    preview = client.get(f"/api/v1/finance-tax/{request_id}").json()
    assert preview["preview"]["totals"]["ewt"] == "40.00"
    with SessionLocal() as db:
        summary = validation_summary(db, db.get(PaymentRequest, request_id))
        assert any("EWT" in blocker for blocker in summary["blockers"])
    body = {
        "request_version": 2,
        "version": 0,
        "request_ewt_tax_id": setup_tax["VAT12-EWT1"],
        "line_ewt_overrides": {second_id: setup_tax["NONVAT"]},
        "reason": "Different line withholding",
    }
    key = str(uuid4())
    response = save(client, request_id, headers, body, key)
    assert response.status_code == 200, response.text
    result = response.json()["result"]
    assert result["totals"]["vat"] == "240.00"  # No EWT must not remove VAT.
    assert result["totals"]["ewt"] == "10.00"
    assert result["totals"]["amount_due"] == "2230.00"
    with SessionLocal() as db:
        summary = validation_summary(db, db.get(PaymentRequest, request_id))
        assert not any("EWT" in blocker for blocker in summary["blockers"])
    assert save(client, request_id, headers, body, key).json() == response.json()
    assert save(client, request_id, headers, {**body, "reason": "Different"}, key).status_code == 409
    assert save(client, request_id, headers, body).status_code == 409
    second_result = save(client, request_id, headers, {**body, "version": 1, "line_ewt_overrides": {}})
    assert second_result.json()["result"]["totals"]["ewt"] == "20.00"
    with SessionLocal() as db:
        rows = list(
            db.scalars(
                select(FinanceTaxSnapshot)
                .where(FinanceTaxSnapshot.request_id == request_id)
                .order_by(FinanceTaxSnapshot.version)
            )
        )
        assert len(rows) == 2
        assert rows[0].result == result
    reloaded = client.get(f"/api/v1/finance-tax/{request_id}").json()
    assert len(reloaded["history"]) == 2
    assert reloaded["saved"]["version"] == 2


def test_stage_and_role_permissions_invalid_lines_and_stale_request(client, setup_tax):
    request_id, line_id = submitted_request()
    body = {"request_version": 2, "version": 0, "reason": "Apply default"}
    headers = login(client, "finance.associate@payment.local")
    assert save(client, request_id, headers, body).status_code in (403, 404)
    advance_to_finance(client, request_id)
    owner = login(client, "requestor@payment.local")
    assert save(client, request_id, owner, body).status_code == 403
    headers = login(client, "finance.associate@payment.local")
    assert save(client, request_id, headers, {**body, "request_version": 1}).status_code == 409
    assert save(client, request_id, headers, {**body, "reason": "  "}).status_code == 422
    assert (
        save(
            client, request_id, headers, {**body, "line_ewt_overrides": {str(uuid4()): setup_tax["NONVAT"]}}
        ).status_code
        == 422
    )
    assert save(client, request_id, headers, {**body, "request_ewt_tax_id": str(uuid4())}).status_code == 422
    with SessionLocal() as db:
        assert (
            db.scalar(
                select(func.count()).select_from(FinanceTaxSnapshot).where(FinanceTaxSnapshot.request_id == request_id)
            )
            == 0
        )


def test_setup_changes_do_not_rewrite_saved_calculation_and_request_edits_mark_stale(client, setup_tax):
    request_id, line_id = submitted_request()
    advance_to_finance(client, request_id)
    headers = login(client, "finance.associate@payment.local")
    saved = save(client, request_id, headers, {"request_version": 2, "version": 0, "reason": "Initial"}).json()
    with SessionLocal.begin() as db:
        setting = db.scalar(select(SystemSetting).where(SystemSetting.key == "finance.setup.draft"))
        config = json.loads(setting.value)
        config["tax_by_request_type"]["general"] = setup_tax["NONVAT"]
        setting.value = json.dumps(config)
    view = client.get(f"/api/v1/finance-tax/{request_id}").json()
    assert view["saved"] == saved
    with SessionLocal.begin() as db:
        db.get(PaymentRequest, request_id).version += 1
    view = client.get(f"/api/v1/finance-tax/{request_id}").json()
    assert view["stale"]
    assert view["preview"]["totals"]["ewt"] == "0.00"
    assert view["saved"] == saved


@pytest.mark.parametrize("rounding,expected", [("half_up", "0.03"), ("half_even", "0.02")])
def test_decimal_rounding_boundaries(rounding, expected):
    line = SimpleNamespace(id=uuid4(), position=1, particulars="Fractional EWT", amount=Decimal("2.50"))
    result = calculate(
        [line],
        {"vat_basis": "inclusive", "ewt_basis": "gross", "rounding": rounding},
        {"vat_rate": "0"},
        {"ewt_rate": "1"},
        {},
        2,
    )
    assert result["totals"]["ewt"] == expected
