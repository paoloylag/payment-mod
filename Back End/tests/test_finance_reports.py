# Fixture imports are registered by pytest and deliberately named in test signatures.
# ruff: noqa: F811
from decimal import Decimal
from uuid import uuid4

from payment_module.database import SessionLocal
from payment_module.models import NotificationDelivery, NotificationOutboxEvent, PaymentRequest, User
from payment_module.notification_worker import run_batch
from sqlalchemy import select
from test_all_type_payments import all_setup  # noqa: F401
from test_finance_accounting import accounting_request  # noqa: F401
from test_finance_tax import setup_tax  # noqa: F401
from test_finance_validation import login
from test_finance_vouchers import prepared_voucher  # noqa: F401
from test_fund_returns_recovery import receipt, recovery_evidence, review, unused_advance  # noqa: F401
from test_payment_execution import action, evidence, line, payment_voucher, schedule, view  # noqa: F401


def report(client, kind, **filters):
    login(client, "finance.manager@payment.local")
    response = client.get("/api/v1/reports/finance", params={"kind": kind, **filters})
    assert response.status_code == 200, response.text
    return response.json()


def test_payment_reconciliation_preserves_pending_recovery_and_replacement_balances(client, payment_voucher):
    request_id, signatory, methods = payment_voucher
    with SessionLocal() as db:
        reference = db.get(PaymentRequest, request_id).request_number
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
    data = report(client, "payments", search=reference, export=True)
    assert data["total"] == 1 and len(data["payment_lines"]) == 1
    sums = data["summary"]["currency_totals"]["PHP"]
    assert Decimal(sums["due"]) == Decimal(sums["released"]) == Decimal(sums["uncleared"]) == 1100
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
    assert Decimal(report(client, "payments", search=reference)["items"][0]["released"]) == 1100
    assert report(client, "recoveries", search=reference)["items"][0]["state"] == "pending"
    assert (
        action(
            client, request_id, instruction, "confirm-reversal", 4, email="finance.manager@payment.local"
        ).status_code
        == 200
    )
    row = report(client, "payments", search=reference)["items"][0]
    assert Decimal(row["released"]) == 0 and Decimal(row["remaining"]) == Decimal(row["available"]) == 1100
    assert report(client, "recoveries", search=reference)["items"][0]["verified_recovery"] == "1100.0000"
    assert (
        schedule(
            client, request_id, [line("1100", signatory, methods["BANK_TRANSFER"], predecessor=instruction)], version=2
        ).status_code
        == 200
    )
    data = report(client, "payments", search=reference, export=True)
    assert len(data["payment_lines"]) == 2 and Decimal(data["items"][0]["available"]) == 0
    assert len(report(client, "recoveries", search=reference)["items"][0]["replacement_ids"]) > 0


def test_advance_report_reconciles_posted_liquidation_and_only_verified_returns(client, unused_advance):
    request_id, reference, account = unused_advance
    row = report(client, "advances", search=reference)["items"][0]
    assert Decimal(row["released"]) == 1500 and Decimal(row["applied"]) == 1120
    assert Decimal(row["outstanding"]) == 380 and row["state"] == "outstanding"
    key = str(uuid4())
    assert receipt(client, request_id, account, key=key).status_code == 200
    assert receipt(client, request_id, account, key=key).status_code == 200
    assert Decimal(report(client, "advances", search=reference)["items"][0]["outstanding"]) == 380
    assert review(client, request_id, 1).status_code == 200
    row = report(client, "advances", search=reference)["items"][0]
    assert row["state"] == "settled" and Decimal(row["outstanding"]) == 0
    assert Decimal(row["verified_return"]) == 380
    returns = report(client, "returns")
    found = next(row for row in returns["items"] if row["request_id"] == str(request_id))
    assert found["state"] == "verified" and Decimal(found["outstanding"]) == 0
    for _ in range(30):
        if not any(run_batch(batch_size=100).values()):
            break
    with SessionLocal() as db:
        events = list(
            db.scalars(select(NotificationOutboxEvent).where(NotificationOutboxEvent.aggregate_id == request_id))
        )
        assert len([event for event in events if event.event_type == "fund_return.recorded"]) == 1
        assert len([event for event in events if event.event_type == "fund_return.verified"]) == 1
        assert any(event.event_type == "voucher.prepared" for event in events)
        assert any(event.event_type == "voucher.issued" for event in events)
        future = db.scalar(select(User).where(User.email == "coo@payment.local"))
        assert not list(
            db.scalars(
                select(NotificationDelivery).where(
                    NotificationDelivery.request_id == request_id, NotificationDelivery.recipient_user_id == future.id
                )
            )
        )


def test_finance_reports_require_finance_role_and_validate_ranges(client, payment_voucher):
    login(client, "requestor@payment.local")
    assert client.get("/api/v1/reports/finance").status_code == 403
    login(client, "coo@payment.local")
    assert client.get("/api/v1/reports/finance").status_code == 403
    login(client, "finance.manager@payment.local")
    assert (
        client.get("/api/v1/reports/finance", params={"date_from": "2026-10-30", "date_to": "2026-10-01"}).status_code
        == 422
    )
    assert client.get("/api/v1/reports/finance", params={"age_bucket": "overdue"}).status_code == 422
    assert client.get("/api/v1/reports/finance", params={"search": "%"}).json()["total"] == 0


def test_all_page_totals_dashboard_currency_scope_and_report_limit(client, monkeypatch):
    from payment_module.routers import financial_reports
    from test_phase08_reports import records

    token = records(125)
    with SessionLocal.begin() as db:
        for item in db.scalars(
            select(PaymentRequest).where(PaymentRequest.purpose == token, PaymentRequest.payee_name != "Other user")
        ):
            if item.status == "submitted":
                item.request_type = "cashAdvance"
    data = report(client, "advances", search=token, page_size=20)
    assert data["total"] == 125 and len(data["items"]) == 20
    assert Decimal(data["summary"]["currency_totals"]["PHP"]["requested"]) == Decimal("6307.8750")
    assert Decimal(data["summary"]["currency_totals"]["USD"]["requested"]) == Decimal("6207.7500")
    second = report(client, "advances", search=token, page=2)
    assert not {row["request_id"] for row in data["items"]} & {row["request_id"] for row in second["items"]}
    full = report(client, "advances", search=token, export=True)
    assert len(full["items"]) == 125 and full["summary"] == data["summary"]
    login(client, "requestor@payment.local")
    dashboard = client.get("/api/v1/reports/dashboard").json()
    assert len(dashboard["membership"]["open"]) == 125
    assert dashboard["currency_totals"] == {"PHP": "6307.8750", "USD": "6207.7500"}
    login(client, "coo@payment.local")
    hidden = client.get("/api/v1/reports/dashboard").json()
    assert hidden["requests"] == {} and hidden["currency_totals"] == {}
    monkeypatch.setattr(financial_reports, "LIMIT", 2)
    login(client, "finance.manager@payment.local")
    assert client.get("/api/v1/reports/finance", params={"kind": "advances", "search": token}).status_code == 413


def test_finance_reports_keep_query_count_bounded_at_representative_volume(client):
    from time import perf_counter

    from payment_module.database import engine
    from sqlalchemy import event
    from test_phase08_reports import records

    token = records(1000)
    with SessionLocal.begin() as db:
        for item in db.scalars(
            select(PaymentRequest).where(
                PaymentRequest.purpose == token,
                PaymentRequest.payee_name != "Other user",
                PaymentRequest.status == "submitted",
            )
        ):
            item.request_type = "cashAdvance"
    login(client, "finance.manager@payment.local")
    counts = []

    def count(*args):
        counts.append(1)

    event.listen(engine, "before_cursor_execute", count)
    started = perf_counter()
    try:
        response = client.get("/api/v1/reports/finance", params={"kind": "advances", "search": token, "page_size": 20})
    finally:
        elapsed = perf_counter() - started
        event.remove(engine, "before_cursor_execute", count)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["total"] == 1000 and len(data["items"]) == 20
    assert len(counts) <= 35, len(counts)
    assert Decimal(data["summary"]["currency_totals"]["PHP"]["requested"]) == Decimal("50062.5000")
    print(f"Finance report benchmark: 1000 candidates, {len(counts)} queries, {elapsed:.3f}s, 20 returned rows")


def test_rejected_recovery_report_and_notification_return_to_finance_associate(client, payment_voucher):
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
    assert (
        action(client, request_id, instruction, "reject-recovery", 4, email="finance.manager@payment.local").status_code
        == 200
    )
    data = report(client, "recoveries")
    row = next(row for row in data["items"] if row["request_id"] == str(request_id))
    assert row["state"] == "rejected" and row["payment_state"] == "released"
    assert Decimal(row["verified_recovery"]) == 0 and Decimal(row["pending_recovery"]) == 0
    with SessionLocal() as db:
        event = db.scalar(
            select(NotificationOutboxEvent).where(
                NotificationOutboxEvent.aggregate_id == request_id,
                NotificationOutboxEvent.event_type == "payment.recovery_rejected",
            )
        )
        associate = db.scalar(select(User).where(User.email == "finance.associate@payment.local"))
        assert str(associate.id) in event.payload["notification"]["recipient_ids"]
        assert event.payload["notification"]["title"] == "Payment recovery requires correction"


def test_unclaimed_checks_filter_uses_actual_ready_lines_not_authorized_transfer(client, payment_voucher):
    request_id, signatory, methods = payment_voucher
    assert (
        schedule(
            client,
            request_id,
            [line("600", signatory, methods["BANK_TRANSFER"]), line("500", signatory, methods["CHECK"])],
        ).status_code
        == 200
    )
    payments = view(client, request_id)["lines"]
    for payment in payments:
        assert action(client, request_id, payment["id"], "authorize", 1).status_code == 200
    assert report(client, "payments", state="unclaimed")["total"] == 0
    assert action(client, request_id, payments[1]["id"], "pickup-ready", 2).status_code == 200
    data = report(client, "payments", state="unclaimed")
    row = next(row for row in data["items"] if row["request_id"] == str(request_id))
    assert row["unclaimed_checks"] == 1 and Decimal(row["unclaimed_amount"]) == 500
    assert Decimal(data["summary"]["currency_totals"]["PHP"]["unclaimed_amount"]) == 500
    login(client, "finance.manager@payment.local")
    snapshot = client.get("/api/v1/reports/dashboard").json()
    assert snapshot["unclaimed_check_count"] == 1
