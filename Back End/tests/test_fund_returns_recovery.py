from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from payment_module.advance_settlement import advance_source, settled_advance_references
from payment_module.database import SessionLocal
from payment_module.main import app
from payment_module.models import (
    ChartAccount,
    FinanceJournalSnapshot,
    FinanceTaxSnapshot,
    PaymentInstruction,
    PaymentLineEvent,
    PaymentRequest,
)
from payment_module.routers.payment_execution import recovery_allowed
from sqlalchemy import select
from test_all_type_payments import all_setup, prepare_type, released_advance  # noqa: F401
from test_documents import FakeStorage
from test_finance_accounting import accounting_request  # noqa: F401
from test_finance_tax import setup_tax  # noqa: F401
from test_finance_validation import login
from test_finance_vouchers import command, prepared_voucher  # noqa: F401
from test_payment_execution import action, evidence, line, payment_voucher, schedule, view  # noqa: F401


def recovery_evidence(client, request_id, instruction_id):
    headers = login(client, "finance.associate@payment.local")
    response = client.post(
        f"/api/v1/payments/{request_id}/lines/{instruction_id}/evidence/upload",
        headers={**headers, "Idempotency-Key": str(uuid4())},
        data={"kind": "recovery"},
        files={"file": ("recovered.pdf", b"%PDF-1.4\nRecovered funds\n%%EOF", "application/pdf")},
    )
    assert response.status_code == 200, response.text
    return response.json()["id"]


@pytest.mark.parametrize("cleared", [False, True])
def test_full_recovery_preserves_balances_until_verified_and_requires_linked_fresh_authorization(
    client,
    payment_voucher,  # noqa: F811
    cleared,  # noqa: F811
):  # noqa: F811
    request_id, signatory, methods = payment_voucher
    assert schedule(client, request_id, [line("1100", signatory, methods["BANK_TRANSFER"])]).status_code == 200
    instruction = view(client, request_id)["lines"][0]["id"]
    assert action(client, request_id, instruction, "authorize", 1).status_code == 200
    release = evidence(client, request_id, instruction, "release").json()["id"]
    assert (
        action(
            client,
            request_id,
            instruction,
            "release",
            2,
            {"evidence_id": release, "bank_name": "Bank", "recipient_name": "Payee", "recorded_on": "2026-01-02"},
        ).status_code
        == 200
    )
    version = 3
    if cleared:
        proof = evidence(client, request_id, instruction, "clearing").json()["id"]
        assert (
            action(
                client, request_id, instruction, "clear", 3, {"evidence_id": proof, "recorded_on": "2026-01-03"}
            ).status_code
            == 200
        )
        version = 4
    with SessionLocal() as db:
        journal_ids = list(
            db.scalars(select(FinanceJournalSnapshot.id).where(FinanceJournalSnapshot.request_id == request_id))
        )
        tax_ids = list(db.scalars(select(FinanceTaxSnapshot.id).where(FinanceTaxSnapshot.request_id == request_id)))
    proof = recovery_evidence(client, request_id, instruction)
    body = {
        "evidence_id": proof,
        "recovered_amount": "1100",
        "bank_name": "Receiving Bank",
        "recipient_name": "Payee",
        "recorded_on": "2026-01-04",
    }
    assert (
        action(client, request_id, instruction, "recover", version, {**body, "recovered_amount": "1099"}).status_code
        == 422
    )
    assert (
        action(client, request_id, instruction, "recover", version, {**body, "evidence_id": release}).status_code == 409
    )
    assert (
        action(client, request_id, instruction, "recover", version, {**body, "recorded_on": "2026-01-01"}).status_code
        == 422
    )
    key = str(uuid4())
    recovered = action(client, request_id, instruction, "recover", version, body, key)
    assert recovered.status_code == 200, recovered.text
    assert action(client, request_id, instruction, "recover", version, body, key).json() == recovered.json()
    pending = view(client, request_id)
    assert pending["summary"]["state"] == "recovery_pending"
    assert Decimal(pending["summary"]["available"]) == 0
    assert Decimal(pending["summary"]["released"]) == 1100
    assert Decimal(pending["summary"]["cleared"]) == (1100 if cleared else 0)
    assert action(client, request_id, instruction, "confirm-reversal", version + 1).status_code == 403
    key = str(uuid4())
    result = action(
        client, request_id, instruction, "confirm-reversal", version + 1, key=key, email="finance.manager@payment.local"
    )
    assert result.status_code == 200, result.text
    assert (
        action(
            client,
            request_id,
            instruction,
            "confirm-reversal",
            version + 1,
            key=key,
            email="finance.manager@payment.local",
        ).json()
        == result.json()
    )
    after = view(client, request_id)
    assert after["summary"]["state"] == "reversed"
    assert Decimal(after["summary"]["available"]) == 1100
    assert Decimal(after["summary"]["released"]) == 0
    assert Decimal(after["summary"]["cleared"]) == 0
    assert Decimal(after["summary"]["recovered"]) == 1100
    assert (
        schedule(client, request_id, [line("1100", signatory, methods["BANK_TRANSFER"])], version=2).status_code == 409
    )
    replacement = schedule(
        client, request_id, [line("1100", signatory, methods["BANK_TRANSFER"], instruction)], version=2
    )
    assert replacement.status_code == 200, replacement.text
    rows = view(client, request_id)["lines"]
    assert rows[1]["state"] == "prepared" and rows[1]["predecessor_id"] == instruction
    assert action(client, request_id, rows[1]["id"], "release", 1, {"evidence_id": release}).status_code == 409
    with SessionLocal() as db:
        assert (
            list(db.scalars(select(FinanceJournalSnapshot.id).where(FinanceJournalSnapshot.request_id == request_id)))
            == journal_ids
        )
        assert (
            list(db.scalars(select(FinanceTaxSnapshot.id).where(FinanceTaxSnapshot.request_id == request_id)))
            == tax_ids
        )


def test_rejected_recovery_restores_prior_state_and_supports_retry(client, payment_voucher):  # noqa: F811
    request_id, signatory, methods = payment_voucher
    assert schedule(client, request_id, [line("1100", signatory, methods["BANK_TRANSFER"])]).status_code == 200
    instruction = view(client, request_id)["lines"][0]["id"]
    assert action(client, request_id, instruction, "authorize", 1).status_code == 200
    proof = evidence(client, request_id, instruction, "release").json()["id"]
    assert (
        action(
            client,
            request_id,
            instruction,
            "release",
            2,
            {"evidence_id": proof, "bank_name": "Bank", "recipient_name": "Payee"},
        ).status_code
        == 200
    )
    recovered = recovery_evidence(client, request_id, instruction)
    assert (
        action(
            client,
            request_id,
            instruction,
            "recover",
            3,
            {"evidence_id": recovered, "recovered_amount": "1100", "bank_name": "Bank", "recipient_name": "Payee"},
        ).status_code
        == 200
    )
    key = str(uuid4())
    rejected = action(
        client, request_id, instruction, "reject-recovery", 4, key=key, email="finance.manager@payment.local"
    )
    assert rejected.status_code == 200, rejected.text
    assert (
        action(
            client, request_id, instruction, "reject-recovery", 4, key=key, email="finance.manager@payment.local"
        ).json()
        == rejected.json()
    )
    data = view(client, request_id)
    assert data["lines"][0]["state"] == "released"
    assert Decimal(data["summary"]["available"]) == 0
    assert data["lines"][0]["can_confirm_reversal"] is False


@pytest.fixture()
def unused_advance(client, all_setup, monkeypatch):  # noqa: F811
    with SessionLocal.begin() as db:
        reference = released_advance(db, all_setup, "1500")
    prepare_type(
        client, all_setup, "liquidation", {"cash_advance_reference": reference, "liquidation_advance_amount": "1500"}
    )
    storage = FakeStorage()
    monkeypatch.setattr("payment_module.routers.fund_returns.get_storage", lambda: storage)
    return all_setup[0], reference, all_setup[2][1]


def receipt(
    client,
    request_id,
    account,
    version=0,
    amount="380",
    email="finance.associate@payment.local",
    key=None,
    entirely_unused=False,
):
    headers = login(client, email)
    return client.post(
        f"/api/v1/payments/{request_id}/fund-return",
        headers={**headers, "Idempotency-Key": key or str(uuid4())},
        data={
            "request_version": 2,
            "version": version,
            "amount": amount,
            "recorded_on": "2026-01-04",
            "reference": "RECEIPT-001",
            "receiving_office": "Cash office",
            "receiving_account_id": account,
            "entirely_unused": str(entirely_unused).lower(),
            "reason": "Full unused advance deposited",
        },
        files={"file": ("return.pdf", b"%PDF-1.4\nReceipt\n%%EOF", "application/pdf")},
    )


def review(client, request_id, version, action_name="verify", email="finance.manager@payment.local", key=None):
    headers = login(client, email)
    return client.post(
        f"/api/v1/payments/{request_id}/fund-return/{action_name}",
        headers={**headers, "Idempotency-Key": key or str(uuid4())},
        json={"request_version": 2, "version": version, "reason": "Reviewed receipt and cash deposit"},
    )


def test_full_return_requires_verification_and_settles_original_advance(client, unused_advance):
    request_id, reference, account = unused_advance
    assert receipt(client, request_id, account, amount="379").status_code == 422
    assert receipt(client, request_id, account, email="requestor@payment.local").status_code in {403, 404}
    assert review(client, request_id, 0).status_code == 409
    key = str(uuid4())
    saved = receipt(client, request_id, account, key=key)
    assert saved.status_code == 200, saved.text
    assert receipt(client, request_id, account, key=key).json() == saved.json()
    assert receipt(client, request_id, account).status_code == 409
    assert Decimal(view(client, request_id)["summary"]["fund_return_outstanding"]) == 380
    manager = login(client, "finance.manager@payment.local")
    assert (
        command(
            client, request_id, "void", manager, {"request_version": 2, "version": 1, "reason": "Do not erase receipt"}
        ).status_code
        == 409
    )
    assert review(client, request_id, 1, email="finance.associate@payment.local").status_code == 403
    key = str(uuid4())
    verified = review(client, request_id, 1, key=key)
    assert verified.status_code == 200, verified.text
    assert review(client, request_id, 1, key=key).json() == verified.json()
    assert review(client, request_id, 1).status_code == 409
    data = view(client, request_id)
    assert data["summary"]["state"] == "funds_returned"
    assert Decimal(data["summary"]["fund_return_outstanding"]) == 0
    entries = verified.json()["result"]["receipt_entries"]
    assert sum(Decimal(row["debit"]) for row in entries) == sum(Decimal(row["credit"]) for row in entries) == 380
    with SessionLocal() as db:
        item = db.get(PaymentRequest, request_id)
        assert reference in settled_advance_references(db, item.requestor_id)
    queue = client.get("/api/v1/finance-operations").json()
    row = next(row for row in queue["items"] if row["request_id"] == str(request_id))
    assert Decimal(row["fund_return_verified"]) == 380
    assert Decimal(row["fund_return_outstanding"]) == 0
    printed = client.get(f"/api/v1/finance-vouchers/{request_id}/print-data").json()
    assert printed["current_state"] == "funds_returned"


def test_rejected_return_can_be_corrected_and_inactive_receiving_account_blocks_verification(client, unused_advance):
    request_id, _, account = unused_advance
    assert receipt(client, request_id, account).status_code == 200
    assert review(client, request_id, 1, "reject").status_code == 200
    assert Decimal(view(client, request_id)["summary"]["fund_return_outstanding"]) == 380
    assert receipt(client, request_id, account, version=2).status_code == 200
    try:
        with SessionLocal.begin() as db:
            db.get(ChartAccount, UUID(account)).is_active = False
        assert review(client, request_id, 3).status_code == 409
    finally:
        with SessionLocal.begin() as db:
            db.get(ChartAccount, UUID(account)).is_active = True
    assert review(client, request_id, 3).status_code == 200


def test_concurrent_return_verification_only_settles_once(client, unused_advance):
    request_id, _, account = unused_advance
    assert receipt(client, request_id, account).status_code == 200
    headers = login(client, "finance.manager@payment.local")

    def confirm(_):
        with TestClient(app) as other:
            other.cookies.update(client.cookies)
            return other.post(
                f"/api/v1/payments/{request_id}/fund-return/verify",
                headers={**headers, "Idempotency-Key": str(uuid4())},
                json={"request_version": 2, "version": 1, "reason": "Verified once"},
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(confirm, range(2))) == [200, 409]
    assert Decimal(view(client, request_id)["summary"]["fund_return_verified"]) == 380


def test_cannot_recover_advance_with_posted_liquidation(client, unused_advance):
    _, reference, _ = unused_advance
    with SessionLocal() as db:
        source = db.scalar(select(PaymentRequest).where(PaymentRequest.request_number == reference))
        with pytest.raises(HTTPException, match="posted Liquidation"):
            recovery_allowed(db, source)


def test_return_date_cannot_precede_the_source_advance_release(client, unused_advance):
    request_id, reference, account = unused_advance
    with SessionLocal.begin() as db:
        source = db.scalar(select(PaymentRequest).where(PaymentRequest.request_number == reference))
        event = db.scalar(
            select(PaymentLineEvent).join(PaymentInstruction).where(PaymentInstruction.request_id == source.id)
        )
        event.result = {"recorded_on": "2026-01-05"}
    response = receipt(client, request_id, account)
    assert response.status_code == 422 and "before" in response.text


def test_entirely_unused_advance_can_be_returned_without_creating_zero_expense_liquidation(
    client,
    all_setup,  # noqa: F811
    monkeypatch,
):  # noqa: F811
    request_id = all_setup[0]
    prepare_type(client, all_setup, "cashAdvance")
    with SessionLocal() as db:
        from payment_module.models import PaymentMethod, User

        signatory = str(db.scalar(select(User.id).where(User.email == "signatory@payment.local")))
        method = str(db.scalar(select(PaymentMethod.id).where(PaymentMethod.code == "BANK_TRANSFER")))
    assert schedule(client, request_id, [line("1120", signatory, method)]).status_code == 200
    instruction = view(client, request_id)["lines"][0]["id"]
    assert action(client, request_id, instruction, "authorize", 1).status_code == 200
    proof = evidence(client, request_id, instruction, "release").json()["id"]
    assert (
        action(
            client,
            request_id,
            instruction,
            "release",
            2,
            {"evidence_id": proof, "bank_name": "Bank", "recipient_name": "Payee", "recorded_on": "2026-01-02"},
        ).status_code
        == 200
    )
    login(client, "finance.associate@payment.local")
    before = client.get(f"/api/v1/payments/{request_id}").json()
    assert before["fund_return"]["can_record"]
    assert before["fund_return"]["mode"] == "full_advance"
    storage = FakeStorage()
    monkeypatch.setattr("payment_module.routers.fund_returns.get_storage", lambda: storage)
    account = all_setup[2][1]
    assert receipt(client, request_id, account, amount="1120").status_code == 422
    saved = receipt(client, request_id, account, amount="1120", entirely_unused=True)
    assert saved.status_code == 200, saved.text
    assert view(client, request_id)["summary"]["state"] == "fund_return_pending"
    assert recovery_evidence_blocked(client, request_id, instruction)
    with SessionLocal() as db:
        item = db.get(PaymentRequest, request_id)
        candidate = SimpleNamespace(
            requestor_id=item.requestor_id,
            currency_code=item.currency_code,
            type_data={"cash_advance_reference": item.request_number, "liquidation_advance_amount": "1120"},
        )
        with pytest.raises(HTTPException, match="full return"):
            advance_source(db, candidate)
    verified = review(client, request_id, 1)
    assert verified.status_code == 200, verified.text
    assert view(client, request_id)["summary"]["state"] == "funds_returned"
    with SessionLocal() as db:
        item = db.get(PaymentRequest, request_id)
        assert item.request_number in settled_advance_references(db, item.requestor_id)


def recovery_evidence_blocked(client, request_id, instruction):
    headers = login(client, "finance.associate@payment.local")
    response = client.post(
        f"/api/v1/payments/{request_id}/lines/{instruction}/evidence/upload",
        headers={**headers, "Idempotency-Key": str(uuid4())},
        data={"kind": "recovery"},
        files={"file": ("double-return.pdf", b"%PDF-1.4\nProof\n%%EOF", "application/pdf")},
    )
    return response.status_code == 409
