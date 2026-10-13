from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from payment_module.database import SessionLocal
from payment_module.main import app
from payment_module.models import PaymentInstruction, PaymentMethod, User
from sqlalchemy import select
from test_documents import FakeStorage
from test_finance_accounting import accounting_request  # noqa: F401
from test_finance_tax import setup_tax  # noqa: F401
from test_finance_validation import login
from test_finance_vouchers import command, prepared_voucher  # noqa: F401


@pytest.fixture()
def payment_voucher(client, prepared_voucher, monkeypatch):  # noqa: F811
    request_id, setup_version, _, _ = prepared_voucher
    storage = FakeStorage()
    monkeypatch.setattr("payment_module.routers.documents.get_storage", lambda: storage)
    monkeypatch.setattr("payment_module.routers.payment_execution.get_storage", lambda: storage)
    manager = login(client, "finance.manager@payment.local")
    issued = command(
        client,
        request_id,
        "issue",
        manager,
        {
            "request_version": 2,
            "version": 0,
            "setup_version": setup_version,
            "reason": "Certified",
        },
    )
    assert issued.status_code == 200, issued.text
    with SessionLocal() as db:
        signatory = db.scalar(select(User.id).where(User.email == "signatory@payment.local"))
        methods = {row.code: str(row.id) for row in db.scalars(select(PaymentMethod))}
    return request_id, str(signatory), methods


def line(amount, signatory, method, predecessor=None):
    result = {
        "label": "Scheduled installment",
        "amount": amount,
        "method_id": method,
        "signatory_user_id": signatory,
        "reference": f"TX-{uuid4().hex}",
    }
    if predecessor:
        result["predecessor_id"] = predecessor
    return result


def schedule(client, request_id, lines, version=1, key=None):
    headers = login(client, "finance.associate@payment.local")
    return client.post(
        f"/api/v1/payments/{request_id}/lines",
        headers={**headers, "Idempotency-Key": key or str(uuid4())},
        json={"request_version": 2, "version": version, "reason": "Prepare installments", "lines": lines},
    )


def action(client, request_id, instruction_id, action_name, version, extra=None, key=None, email=None):
    default = {
        "authorize": "signatory",
        "clear": "finance.manager",
        "fail": "finance.manager",
        "void": "finance.manager",
    }
    headers = login(client, email or f"{default.get(action_name, 'finance.associate')}@payment.local")
    return client.post(
        f"/api/v1/payments/{request_id}/lines/{instruction_id}/{action_name}",
        headers={**headers, "Idempotency-Key": key or str(uuid4())},
        json={"request_version": 2, "version": version, "reason": "Verified payment", **(extra or {})},
    )


def evidence(client, request_id, instruction_id, kind, key=None):
    headers = login(client, "finance.associate@payment.local" if kind == "release" else "finance.manager@payment.local")
    return client.post(
        f"/api/v1/payments/{request_id}/lines/{instruction_id}/evidence/upload",
        headers={**headers, "Idempotency-Key": key or str(uuid4())},
        data={"kind": kind},
        files={"file": ("proof.pdf", b"%PDF-1.4\nPayment evidence\n%%EOF", "application/pdf")},
    )


def view(client, request_id):
    login(client, "finance.manager@payment.local")
    response = client.get(f"/api/v1/payments/{request_id}")
    assert response.status_code == 200, response.text
    return response.json()


def test_multiple_payments_authorize_release_clear_and_cap(client, payment_voucher):
    request_id, signatory, methods = payment_voucher
    lines = [line("600.00", signatory, methods["BANK_TRANSFER"]), line("500.00", signatory, methods["CHECK"])]
    assert schedule(client, request_id, [line("1100.01", signatory, methods["CHECK"])]).status_code == 409
    key = str(uuid4())
    prepared = schedule(client, request_id, lines, key=key)
    assert prepared.status_code == 200, prepared.text
    assert schedule(client, request_id, lines, key=key).json() == prepared.json()
    assert schedule(client, request_id, [line("1.00", signatory, methods["CHECK"])], version=2).status_code == 409
    data = view(client, request_id)
    first, second = [row["id"] for row in data["lines"]]
    assert data["summary"]["allocated"] == "1100.0000"
    assert evidence(client, request_id, first, "release").status_code == 409
    assert action(client, request_id, first, "authorize", 1, email="finance.associate@payment.local").status_code == 403
    auth_key = str(uuid4())
    auth = action(client, request_id, first, "authorize", 1, key=auth_key)
    assert auth.status_code == 200, auth.text
    assert action(client, request_id, first, "authorize", 1, key=auth_key).json() == auth.json()
    assert (
        action(client, request_id, first, "authorize", 1, extra={"bank_name": "changed"}, key=auth_key).status_code
        == 409
    )
    login(client, "signatory@payment.local")
    queue = [row for row in client.get("/api/v1/finance-vouchers/queue").json() if row["request_id"] == str(request_id)]
    assert len(queue) == 1 and queue[0]["pending"]
    assert action(client, request_id, first, "release", 2).status_code == 409
    evidence_key = str(uuid4())
    receipt = evidence(client, request_id, first, "release", evidence_key)
    assert receipt.status_code == 200, receipt.text
    assert evidence(client, request_id, first, "release", evidence_key).json() == receipt.json()
    released = action(
        client,
        request_id,
        first,
        "release",
        2,
        {
            "evidence_id": receipt.json()["id"],
            "bank_name": "Test Bank",
            "recipient_name": "Vendor",
            "recorded_on": "2026-01-02",
        },
    )
    assert released.status_code == 200, released.text
    assert view(client, request_id)["summary"]["remaining"] == "500.0000"
    assert action(client, request_id, first, "fail", 3).status_code == 409
    manager = login(client, "finance.manager@payment.local")
    assert (
        command(
            client, request_id, "void", manager, {"request_version": 2, "version": 2, "reason": "void paid"}
        ).status_code
        == 409
    )
    assert action(client, request_id, first, "clear", 3, {"evidence_id": receipt.json()["id"]}).status_code == 409
    cleared_receipt = evidence(client, request_id, first, "clearing")
    assert cleared_receipt.status_code == 200, cleared_receipt.text
    assert (
        action(
            client,
            request_id,
            first,
            "clear",
            3,
            {"evidence_id": cleared_receipt.json()["id"], "recorded_on": "2026-01-01"},
        ).status_code
        == 422
    )
    assert (
        action(client, request_id, first, "clear", 3, {"evidence_id": cleared_receipt.json()["id"]}).status_code == 200
    )
    assert action(client, request_id, second, "authorize", 1).status_code == 200
    assert action(client, request_id, second, "release", 2, {"evidence_id": receipt.json()["id"]}).status_code == 409
    assert action(client, request_id, second, "pickup-ready", 2).status_code == 200
    second_receipt = evidence(client, request_id, second, "release").json()
    assert (
        action(
            client,
            request_id,
            second,
            "release",
            3,
            {
                "evidence_id": receipt.json()["id"],
                "bank_name": "Bank",
                "recipient_name": "Vendor",
            },
        ).status_code
        == 409
    )
    assert (
        action(
            client,
            request_id,
            second,
            "release",
            3,
            {
                "evidence_id": second_receipt["id"],
                "bank_name": "Bank",
                "recipient_name": "Vendor",
            },
        ).status_code
        == 200
    )
    assert view(client, request_id)["summary"]["state"] == "released"
    second_clear = evidence(client, request_id, second, "clearing").json()
    assert action(client, request_id, second, "clear", 4, {"evidence_id": second_clear["id"]}).status_code == 200
    final = view(client, request_id)
    assert final["summary"]["state"] == "cleared" and float(final["summary"]["remaining"]) == 0
    assert not final["can_add"] and all(not row["can_fail"] for row in final["lines"])
    printable = client.get(f"/api/v1/finance-vouchers/{request_id}/print-data").json()
    assert len(printable["execution"]["lines"]) == 2
    assert printable["current_state"] == "cleared"


def test_failure_replacement_requires_fresh_authorization_and_preserves_history(client, payment_voucher):
    request_id, signatory, methods = payment_voucher
    assert schedule(client, request_id, [line("1100.00", signatory, methods["CHECK"])]).status_code == 200
    original = view(client, request_id)["lines"][0]["id"]
    assert action(client, request_id, original, "authorize", 1).status_code == 200
    assert action(client, request_id, original, "fail", 2).status_code == 200
    replacement = line("1100.00", signatory, methods["BANK_TRANSFER"], original)
    assert schedule(client, request_id, [{**replacement, "amount": "100.00"}], version=2).status_code == 409
    assert schedule(client, request_id, [replacement], version=2).status_code == 200
    data = view(client, request_id)
    old, new = data["lines"]
    assert old["state"] == "failed" and len(old["history"]) == 3
    assert old["replacement_id"] == new["id"] and new["predecessor_id"] == original
    assert new["state"] == "prepared" and not new["can_release"]
    assert action(client, request_id, new["id"], "release", 1).status_code == 409
    assert action(client, request_id, new["id"], "authorize", 1).status_code == 200
    with SessionLocal() as db:
        assert (
            db.get(PaymentInstruction, UUID(original)).reference
            != db.get(PaymentInstruction, UUID(new["id"])).reference
        )


def test_payment_validation_permissions_duplicates_and_void_history(client, payment_voucher):
    request_id, signatory, methods = payment_voucher
    payment = line("1100.00", signatory, methods["CASH"])
    for amount in ("0", "-1", "NaN", "0.001"):
        assert schedule(client, request_id, [{**payment, "amount": amount}]).status_code == 422
    assert schedule(client, request_id, [{**payment, "signatory_user_id": str(uuid4())}]).status_code == 422
    assert schedule(client, request_id, [{**payment, "method_id": str(uuid4())}]).status_code == 422
    assert schedule(client, request_id, [payment, {**payment, "amount": "1"}]).status_code == 409
    assert view(client, request_id)["lines"] == []
    duplicate = [{**payment, "amount": "500"}, {**payment, "amount": "600"}]
    assert schedule(client, request_id, duplicate).status_code == 409
    assert view(client, request_id)["lines"] == []
    assert schedule(client, request_id, [payment]).status_code == 200
    instruction = view(client, request_id)["lines"][0]["id"]
    assert action(client, request_id, instruction, "clear", 1).status_code == 409
    assert action(client, request_id, instruction, "authorize", 0).status_code == 409
    assert action(client, request_id, instruction, "authorize", 1).status_code == 200
    assert action(client, request_id, instruction, "pickup-ready", 2).status_code == 409
    assert (
        action(client, request_id, instruction, "release", 2, email="finance.manager@payment.local").status_code == 403
    )
    assert (
        action(client, request_id, instruction, "clear", 2, email="finance.associate@payment.local").status_code == 403
    )
    assert action(client, request_id, instruction, "release", 2, {"recorded_on": "2099-01-01"}).status_code == 422
    assert action(client, request_id, instruction, "void", 2).status_code == 200
    voided = view(client, request_id)
    assert voided["lines"][0]["state"] == "voided"
    assert float(voided["summary"]["available"]) == 1100
    assert action(client, request_id, instruction, "release", 3).status_code == 409
    owner = login(client, "requestor@payment.local")
    assert client.get(f"/api/v1/payments/{request_id}", headers=owner).status_code == 404


def test_concurrent_preparation_serializes_voucher_allocation(client, payment_voucher):
    request_id, signatory, methods = payment_voucher

    def prepare():
        with TestClient(app) as session:
            return schedule(session, request_id, [line("700.00", signatory, methods["BANK_TRANSFER"])]).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = list(executor.map(lambda _: prepare(), range(2)))
    assert sorted(statuses) == [200, 409]
    data = view(client, request_id)
    assert len(data["lines"]) == 1
    assert float(data["summary"]["allocated"]) == 700
    assert float(data["summary"]["available"]) == 400
