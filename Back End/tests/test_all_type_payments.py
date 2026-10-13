from decimal import Decimal
from uuid import uuid4

import pytest
from payment_module.database import SessionLocal
from payment_module.finance_accounting import build_entries
from payment_module.finance_tax import build_calculation
from payment_module.models import (
    ChartAccount,
    Document,
    DocumentReviewDecision,
    DocumentType,
    DocumentVersion,
    FinanceConfiguration,
    FinanceJournalSnapshot,
    FinanceTaxSnapshot,
    FinanceVoucherDraft,
    FinanceVoucherEvent,
    PaymentInstruction,
    PaymentLineEvent,
    PaymentRequest,
    PaymentRequestLine,
    User,
)
from sqlalchemy import delete, select
from test_documents import FakeStorage
from test_finance_accounting import accounting_request, command  # noqa: F401
from test_finance_tax import save, setup_tax  # noqa: F401
from test_finance_validation import login
from test_finance_vouchers import command as voucher_command
from test_payment_execution import action, evidence, line, schedule, view


@pytest.fixture()
def all_setup(client, accounting_request, monkeypatch):  # noqa: F811
    request_id, line_id, accounts, _ = accounting_request
    storage = FakeStorage()
    monkeypatch.setattr("payment_module.routers.documents.get_storage", lambda: storage)
    monkeypatch.setattr("payment_module.routers.payment_execution.get_storage", lambda: storage)
    with SessionLocal.begin() as db:
        before_requests = set(db.scalars(select(PaymentRequest.id)))
        before = set(db.scalars(select(FinanceConfiguration.id)))
        asset = ChartAccount(
            code=f"ADV-{uuid4().hex[:8]}",
            name="Staff advance asset",
            account_type="asset",
            normal_balance="debit",
            is_posting=True,
        )
        db.add(asset)
        db.flush()
        asset_id = asset.id
    manager = login(client, "finance.manager@payment.local")
    setup = client.get("/api/v1/request-settings/finance-setup").json()
    setup.update(
        setup_scope="system",
        voucher={
            "prefix": "PV",
            "reset_basis": "calendar_year",
            "certification_text": "Finance certifies this voucher",
            "create_role": "finance_associate",
            "post_role": "finance_manager",
            "void_role": "finance_manager",
        },
    )
    setup["accounts_by_request_type"]["cashAdvance"] = {
        "debit_account_id": str(asset_id),
        "credit_account_id": accounts[3],
    }
    saved = client.put("/api/v1/request-settings/finance-setup", headers=manager, json=setup)
    assert saved.status_code == 200, saved.text
    activation = client.post(
        "/api/v1/request-settings/finance-setup/activate",
        headers={**manager, "Idempotency-Key": str(uuid4())},
        json={
            "scope": "all",
            "draft_version": saved.json()["version"],
            "expected_previous_version": saved.json()["activation"]["latest_version"],
            "reason": "Enable all payment types",
        },
    )
    assert activation.status_code == 200, activation.text
    assert activation.json()["operational_status"] == "all_active"
    yield request_id, line_id, accounts, asset_id, activation.json()
    with SessionLocal.begin() as db:
        db.execute(delete(PaymentInstruction).where(PaymentInstruction.request_id == request_id))
        db.execute(delete(FinanceVoucherEvent).where(FinanceVoucherEvent.request_id == request_id))
        db.execute(delete(PaymentRequest).where(PaymentRequest.id.not_in(before_requests)))
        db.execute(delete(FinanceConfiguration).where(FinanceConfiguration.id.not_in(before)))
        # Any fixture-created source advances are removed before their asset account.
        sources = list(db.scalars(select(PaymentRequest).where(PaymentRequest.payee_name == "Advance source fixture")))
        for source in sources:
            db.delete(source)
        db.flush()
        db.execute(delete(ChartAccount).where(ChartAccount.id == asset_id))


def accept_documents(db, item, line_id):
    for kind in db.scalars(select(DocumentType)):
        document = Document(
            request_id=item.id, line_id=line_id, owner_user_id=item.requestor_id, document_type_id=kind.id
        )
        db.add(document)
        db.flush()
        db.add(
            DocumentVersion(
                document_id=document.id,
                version=1,
                original_filename="proof.pdf",
                media_type="application/pdf",
                byte_size=10,
                sha256="a" * 64,
                bucket="test",
                object_key=str(uuid4()),
                uploaded_by_user_id=item.requestor_id,
            )
        )
        db.add(DocumentReviewDecision(document_id=document.id, decision="accepted", actor_user_id=item.requestor_id))


def prepare_type(client, setup, request_type, type_data=None):
    request_id, line_id, _, _, _ = setup
    with SessionLocal.begin() as db:
        item = db.get(PaymentRequest, request_id)
        db.execute(delete(FinanceTaxSnapshot).where(FinanceTaxSnapshot.request_id == item.id))
        item.request_type = request_type
        item.type_data = {**item.type_data, **(type_data or {})}
        accept_documents(db, item, line_id)
    associate = login(client, "finance.associate@payment.local")
    calculated = save(
        client, request_id, associate, {"request_version": 2, "version": 0, "reason": "Review calculation"}
    )
    assert calculated.status_code == 200, calculated.text
    drafted = command(
        client,
        request_id,
        "draft",
        associate,
        {"request_version": 2, "version": 0, "tax_version": 1, "reason": "Prepare"},
    )
    assert drafted.status_code == 200, drafted.text
    accepted = client.post(
        f"/api/v1/finance-validation/{request_id}/lines/{line_id}/reviews",
        headers=associate,
        json={"request_version": 2, "decision": "accepted", "physical_original_received": True},
    )
    assert accepted.status_code == 201, accepted.text
    approved = client.post(
        f"/api/v1/workflow/{request_id}/approve",
        headers={**associate, "Idempotency-Key": str(uuid4())},
        json={"version": 2},
    )
    assert approved.status_code == 200, approved.text
    manager = login(client, "finance.manager@payment.local")
    approved = client.post(
        f"/api/v1/workflow/{request_id}/approve",
        headers={**manager, "Idempotency-Key": str(uuid4())},
        json={"version": 3},
    )
    assert approved.status_code == 200, approved.text
    posted = command(
        client, request_id, "post", manager, {"request_version": 2, "version": 1, "tax_version": 1, "reason": "Post"}
    )
    assert posted.status_code == 200, posted.text
    associate = login(client, "finance.associate@payment.local")
    voucher = command(
        client,
        request_id,
        "voucher",
        associate,
        {"request_version": 2, "version": 2, "tax_version": 1, "reason": "Voucher"},
    )
    assert voucher.status_code == 200, voucher.text
    manager = login(client, "finance.manager@payment.local")
    issued = voucher_command(
        client,
        request_id,
        "issue",
        manager,
        {"request_version": 2, "version": 0, "setup_version": setup[4]["version"], "reason": "Certify"},
    )
    assert issued.status_code == 200, issued.text
    return calculated.json(), posted.json(), voucher.json()


@pytest.mark.parametrize("request_type", ["reimbursement", "poPayment", "cashAdvance"])
def test_all_types_use_configured_accounting_and_payment_controls(client, all_setup, request_type):
    request_id, _, _, asset_id, _ = all_setup
    tax, posted, voucher = prepare_type(client, all_setup, request_type)
    due = "1120.00" if request_type == "cashAdvance" else "1100.00"
    assert voucher["result"]["totals"]["amount_due"] == due
    if request_type == "cashAdvance":
        assert tax["result"]["totals"]["ewt"] == "0.00"
        assert posted["result"]["entries"][0]["component"] == "advance"
        assert posted["result"]["entries"][0]["account"]["id"] == str(asset_id)
    with SessionLocal() as db:
        signatory = str(db.scalar(select(User.id).where(User.email == "signatory@payment.local")))
        from payment_module.models import PaymentMethod

        method = str(db.scalar(select(PaymentMethod.id).where(PaymentMethod.code == "BANK_TRANSFER")))
    assert schedule(client, request_id, [line(due, signatory, method)]).status_code == 200
    payment_id = view(client, request_id)["lines"][0]["id"]
    assert action(client, request_id, payment_id, "authorize", 1).status_code == 200
    receipt = evidence(client, request_id, payment_id, "release").json()
    released = action(
        client,
        request_id,
        payment_id,
        "release",
        2,
        {"evidence_id": receipt["id"], "bank_name": "Bank", "recipient_name": "Payee"},
    )
    assert released.status_code == 200, released.text
    proof = evidence(client, request_id, payment_id, "clearing").json()
    assert action(client, request_id, payment_id, "clear", 3, {"evidence_id": proof["id"]}).status_code == 200
    assert view(client, request_id)["summary"]["state"] == "cleared"


def released_advance(db, setup, amount):
    item = db.get(PaymentRequest, setup[0])
    config = setup[4]["activation"]["active"]["configuration"]
    source = PaymentRequest(
        request_type="cashAdvance",
        status="submitted",
        requestor_id=item.requestor_id,
        department_id=item.department_id,
        currency_code="PHP",
        gross_amount=Decimal(amount),
        version=2,
        request_number=f"CA-{uuid4().hex[:12]}",
        payee_name="Advance source fixture",
        purpose="Released advance",
        type_data={},
    )
    db.add(source)
    db.flush()
    source_line = PaymentRequestLine(
        request_id=source.id,
        position=1,
        particulars="Advance",
        amount=Decimal(amount),
        currency_code="PHP",
        cost_center_id=db.get(PaymentRequestLine, setup[1]).cost_center_id,
    )
    db.add(source_line)
    db.flush()
    result = build_calculation(db, source, config)
    tax = FinanceTaxSnapshot(
        request_id=source.id,
        request_version=2,
        version=1,
        command_key=str(uuid4()),
        payload_hash="a" * 64,
        result=result,
        reason="Source",
        actor_user_id=item.requestor_id,
    )
    db.add(tax)
    db.flush()
    journal = FinanceJournalSnapshot(
        request_id=source.id,
        request_version=2,
        tax_snapshot_id=tax.id,
        version=1,
        state="posted",
        command_key=str(uuid4()),
        payload_hash="a" * 64,
        result=build_entries(db, source, tax, strict=True),
        reason="Source",
        actor_user_id=item.requestor_id,
    )
    db.add(journal)
    db.flush()
    voucher = FinanceVoucherDraft(
        request_id=source.id,
        journal_id=journal.id,
        command_key=str(uuid4()),
        payload_hash="a" * 64,
        actor_user_id=item.requestor_id,
        reason="Source",
        result={"totals": result["totals"], "currency": "PHP"},
    )
    db.add(voucher)
    db.flush()
    db.add(
        FinanceVoucherEvent(
            request_id=source.id,
            voucher_id=voucher.id,
            version=1,
            state="issued",
            voucher_number=f"PV-{uuid4().hex}",
            command_key=str(uuid4()),
            payload_hash="a" * 64,
            result={},
            reason="Source",
            actor_user_id=item.requestor_id,
        )
    )
    from payment_module.models import PaymentMethod

    method = db.scalar(select(PaymentMethod.id).where(PaymentMethod.code == "BANK_TRANSFER"))
    payment = PaymentInstruction(
        voucher_id=voucher.id,
        request_id=source.id,
        signatory_user_id=item.requestor_id,
        preparer_user_id=item.requestor_id,
        method_id=method,
        reference=f"ADV-{uuid4().hex}",
        amount=Decimal(amount),
        currency_code="PHP",
        result={"amount": amount, "currency": "PHP"},
    )
    db.add(payment)
    db.flush()
    db.add(
        PaymentLineEvent(
            instruction_id=payment.id,
            version=1,
            state="released",
            command_key=str(uuid4()),
            payload_hash="a" * 64,
            result={},
            reason="Released source fixture",
            actor_user_id=item.requestor_id,
        )
    )
    db.flush()
    return source.request_number


@pytest.mark.parametrize(
    "advance,due,pending", [("1000", "120.00", "0"), ("1120", "0.00", "0"), ("1500", "0.00", "380.00")]
)
def test_liquidation_offsets_released_advance_and_only_pays_excess(client, all_setup, advance, due, pending):
    with SessionLocal.begin() as db:
        reference = released_advance(db, all_setup, advance)
    tax, posted, voucher = prepare_type(
        client,
        all_setup,
        "liquidation",
        {
            "cash_advance_reference": reference,
            "liquidation_advance_amount": advance,
        },
    )
    assert Decimal(voucher["result"]["totals"]["amount_due"]) == Decimal(due)
    assert Decimal(voucher["result"]["totals"]["cash_return_pending"]) == Decimal(pending)
    assert Decimal(posted["result"]["totals"]["debit"]) == Decimal(posted["result"]["totals"]["credit"])
    credits = [row for row in posted["result"]["entries"] if row["component"] == "advance_settlement"]
    assert credits and credits[0]["account"]["id"] == str(all_setup[3])
    assert tax["result"]["advance_source"]["request_number"] == reference
    if Decimal(due) == 0:
        assert not view(client, all_setup[0])["can_add"]


def test_liquidation_requires_matching_released_advance_and_rejects_duplicate_posting(client, all_setup):
    from fastapi import HTTPException
    from payment_module.advance_settlement import validate_liquidation_posting

    with SessionLocal.begin() as db:
        reference = released_advance(db, all_setup, "1000")
        item = db.get(PaymentRequest, all_setup[0])
        item.request_type = "liquidation"
        item.type_data = {"cash_advance_reference": reference, "liquidation_advance_amount": "999"}
        db.execute(delete(FinanceTaxSnapshot).where(FinanceTaxSnapshot.request_id == item.id))
    associate = login(client, "finance.associate@payment.local")
    invalid = save(client, all_setup[0], associate, {"request_version": 2, "version": 0, "reason": "Review"})
    assert invalid.status_code == 409 and "match" in invalid.text
    tax, _, _ = prepare_type(
        client,
        all_setup,
        "liquidation",
        {
            "cash_advance_reference": reference,
            "liquidation_advance_amount": "1000",
        },
    )
    with SessionLocal.begin() as db:
        original = db.get(PaymentRequest, all_setup[0])
        other = PaymentRequest(
            request_type="liquidation",
            status="submitted",
            requestor_id=original.requestor_id,
            department_id=original.department_id,
            currency_code="PHP",
            gross_amount=original.gross_amount,
            payee_name="Advance source fixture",
            purpose="Duplicate liquidation",
            type_data=dict(original.type_data),
        )
        db.add(other)
        db.flush()
        snapshot = db.scalar(select(FinanceTaxSnapshot).where(FinanceTaxSnapshot.request_id == original.id))
        with pytest.raises(HTTPException, match="already has posted"):
            validate_liquidation_posting(db, other, snapshot)


def test_unused_advance_can_be_submitted_without_claiming_return_and_stays_outstanding(client, all_setup):
    from datetime import timedelta

    from payment_module.finance_readiness import finance_date

    with SessionLocal.begin() as db:
        reference = released_advance(db, all_setup, "1500")
        original = db.get(PaymentRequest, all_setup[0])
        department_id = str(original.department_id)
    owner = login(client, "requestor@payment.local")
    today = finance_date()
    payload = {
        "request_type": "liquidation",
        "department_id": department_id,
        "currency_code": "PHP",
        "payee_name": "Requestor",
        "purpose": "Unused advance remains pending",
        "type_data": {
            "cash_advance_reference": reference,
            "liquidation_advance_amount": "1500",
            "liquidation_due_date": (today + timedelta(days=15)).isoformat(),
            "actual_liquidation_date": today.isoformat(),
        },
        "lines": [
            {
                "amount": "1120",
                "currency_code": "PHP",
                "particulars": "Expense",
                "vendor_name": "Merchant",
                "invoice_number": "LIVE-001",
                "invoice_date": today.isoformat(),
                "attachment_refs": [],
            }
        ],
    }
    created = client.post("/api/v1/requests", headers=owner, json=payload)
    assert created.status_code == 201, created.text
    submitted = client.post(
        f"/api/v1/requests/{created.json()['id']}/submit",
        headers={**owner, "Idempotency-Key": str(uuid4())},
        json={"version": created.json()["version"]},
    )
    assert submitted.status_code == 200, submitted.text
    payload.update(
        request_type="cashAdvance",
        purpose="Another advance",
        type_data={
            "event_end_date": today.isoformat(),
            "liquidation_due_date": (today + timedelta(days=15)).isoformat(),
            "accountability_acknowledged": True,
        },
        lines=[{"amount": "100", "currency_code": "PHP", "particulars": "Advance"}],
    )
    created = client.post("/api/v1/requests", headers=owner, json=payload)
    assert created.status_code == 201, created.text
    rejected = client.post(
        f"/api/v1/requests/{created.json()['id']}/submit",
        headers={**owner, "Idempotency-Key": str(uuid4())},
        json={"version": created.json()["version"]},
    )
    assert rejected.status_code == 422 and "outstanding Cash Advance" in rejected.text
