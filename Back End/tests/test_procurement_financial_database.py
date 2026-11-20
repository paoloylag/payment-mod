import json
from decimal import Decimal

from payment_module.database import SessionLocal
from payment_module.models import PaymentMethod, ProcurementApprovalEvent
from sqlalchemy import select
from test_all_type_payments import all_setup, prepare_type  # noqa: F401
from test_finance_accounting import accounting_request  # noqa: F401
from test_finance_tax import setup_tax  # noqa: F401
from test_fund_returns_recovery import recovery_evidence
from test_payment_execution import action, evidence, line, schedule, view


def messages(request_id):
    with SessionLocal() as db:
        return [
            json.loads(row.body)
            for row in db.scalars(
                select(ProcurementApprovalEvent)
                .where(ProcurementApprovalEvent.request_id == request_id)
                .order_by(ProcurementApprovalEvent.sequence)
            )
        ]


def test_po_approval_and_payment_snapshots_preserve_net_and_recovery_balances(client, all_setup):  # noqa: F811
    request_id = all_setup[0]
    prepare_type(client, all_setup, "poPayment", {"po_reference": "PO-FINANCIAL-TEST"})
    events = messages(request_id)
    approved = next(row for row in events if row["type"] == "aps.po_request.approved")
    assert approved["schemaVersion"] == 2
    totals = approved["financial"]["calculation"]["totals"]
    assert Decimal(totals["grossAmount"]) == 1120
    assert Decimal(totals["vatAmount"]) == 120
    assert Decimal(totals["ewtAmount"]) == 20
    assert Decimal(totals["netPayable"]) == 1100
    assert approved["financial"]["calculation"]["lines"][0]["ewtRate"] == "2.0000"
    with SessionLocal() as db:
        method = str(db.scalar(select(PaymentMethod.id).where(PaymentMethod.code == "BANK_TRANSFER")))
    lines = [line("500", "", method), line("600", "", method)]
    response = schedule(client, request_id, lines)
    assert response.status_code == 200, response.text
    snapshot = messages(request_id)[-1]["financial"]
    assert len(snapshot["payment"]["lines"]) == 2
    assert snapshot["voucher"]["number"]
    payment_id = view(client, request_id)["lines"][0]["id"]
    proof = evidence(client, request_id, payment_id, "release").json()["id"]
    private = {"bank_name": "PRIVATE-BANK-FIELD", "recipient_name": "PRIVATE-RECIPIENT"}
    released = action(client, request_id, payment_id, "release", 1, {"evidence_id": proof, **private})
    assert released.status_code == 200, released.text
    snapshot = messages(request_id)[-1]["financial"]
    assert Decimal(snapshot["payment"]["released"]) == 500
    assert Decimal(snapshot["payment"]["remaining"]) == 600
    proof = evidence(client, request_id, payment_id, "clearing").json()["id"]
    cleared = action(client, request_id, payment_id, "clear", 2, {"evidence_id": proof})
    assert cleared.status_code == 200, cleared.text
    assert Decimal(messages(request_id)[-1]["financial"]["payment"]["cleared"]) == 500
    proof = recovery_evidence(client, request_id, payment_id)
    pending = action(
        client, request_id, payment_id, "recover", 3, {"evidence_id": proof, "recovered_amount": "500", **private}
    )
    assert pending.status_code == 200, pending.text
    assert Decimal(messages(request_id)[-1]["financial"]["payment"]["released"]) == 500
    reversed_payment = action(
        client, request_id, payment_id, "confirm-reversal", 4, email="finance.manager@payment.local"
    )
    assert reversed_payment.status_code == 200, reversed_payment.text
    snapshot = messages(request_id)[-1]["financial"]
    assert Decimal(snapshot["payment"]["released"]) == 0
    assert Decimal(snapshot["payment"]["recovered"]) == 500
    assert Decimal(snapshot["payment"]["remaining"]) == 1100
    events = messages(request_id)
    sequences = [int(row["streamSequence"]) for row in events]
    assert sequences == sorted(set(sequences))
    assert all(row["request"]["status"] == "approved" for row in events)
    assert "PRIVATE-BANK-FIELD" not in json.dumps(events)
    assert "PRIVATE-RECIPIENT" not in json.dumps(events)
    assert not any(row.get("type") == "po.closed" for row in events)
