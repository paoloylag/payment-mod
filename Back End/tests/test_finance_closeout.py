from copy import deepcopy
from decimal import Decimal
from types import SimpleNamespace
from uuid import UUID, uuid4

from payment_module.database import SessionLocal
from payment_module.finance_tax import calculate
from payment_module.models import (
    FinanceJournalSnapshot,
    FinanceTaxSnapshot,
    FinanceVoucherDraft,
    FinanceVoucherReplacement,
    PaymentRequest,
    Permission,
    User,
    UserPermissionOverride,
    WorkflowInstance,
)
from sqlalchemy import delete, select
from test_finance_accounting import accounting_request  # noqa: F401
from test_finance_tax import setup_tax  # noqa: F401
from test_finance_validation import login
from test_finance_vouchers import command, prepared_voucher  # noqa: F401
from test_payment_execution import action, evidence, line, payment_voucher, schedule  # noqa: F401


def test_tojust_construction_200000_configuration_example():
    result = calculate(
        [SimpleNamespace(id=uuid4(), position=1, particulars="TOJUST Construction", amount=Decimal("200000.00"))],
        {"vat_basis": "inclusive", "ewt_basis": "net_of_vat", "rounding": "half_up"},
        {"vat_rate": "12"},
        {"ewt_rate": "2"},
        {},
        2,
    )
    assert result["totals"] == {
        "input_amount": "200000.00",
        "net_of_vat": "178571.43",
        "vat": "21428.57",
        "gross": "200000.00",
        "ewt": "3571.43",
        "amount_due": "196428.57",
    }


def test_queue_latest_payment_state_and_partial_totals(client, payment_voucher):  # noqa: F811
    request_id, signatory, methods = payment_voucher
    prepared = schedule(
        client,
        request_id,
        [line("500.00", signatory, methods["BANK_TRANSFER"]), line("600.00", signatory, methods["BANK_TRANSFER"])],
    )
    assert prepared.status_code == 200, prepared.text
    with SessionLocal() as db:
        from payment_module.models import PaymentInstruction

        instruction_id = str(
            db.scalar(
                select(PaymentInstruction.id).where(
                    PaymentInstruction.request_id == request_id, PaymentInstruction.sequence == 1
                )
            )
        )
    assert action(client, request_id, instruction_id, "authorize", 1).status_code == 200
    uploaded = evidence(client, request_id, instruction_id, "release")
    assert uploaded.status_code == 200
    released = action(
        client,
        request_id,
        instruction_id,
        "release",
        2,
        {
            "evidence_id": uploaded.json()["id"],
            "recorded_on": "2026-10-14",
            "recipient_name": "Vendor",
            "bank_name": "Test bank",
        },
    )
    assert released.status_code == 200, released.text
    login(client, "finance.manager@payment.local")
    result = client.get("/api/v1/finance-operations?line_state=released").json()
    row = next(row for row in result["items"] if row["request_id"] == str(request_id))
    assert Decimal(row["released"]) == 500 and Decimal(row["remaining"]) == 600
    assert result["page_totals"]["PHP"]["released"] == row["released"]
    uploaded = evidence(client, request_id, instruction_id, "clearing")
    assert (
        action(
            client,
            request_id,
            instruction_id,
            "clear",
            3,
            {"evidence_id": uploaded.json()["id"], "recorded_on": "2026-10-14"},
        ).status_code
        == 200
    )
    assert client.get("/api/v1/finance-operations?line_state=released").json()["items"] == []
    assert any(
        row["request_id"] == str(request_id)
        for row in client.get("/api/v1/finance-operations?line_state=cleared").json()["items"]
    )


def test_explicit_denials_block_finance_queue_and_replacement(client, prepared_voucher):  # noqa: F811
    request_id, setup_version, _, _ = prepared_voucher
    target_id, target_version = replacement_fixture(request_id)
    manager = login(client, "finance.manager@payment.local")
    assert (
        command(
            client,
            request_id,
            "issue",
            manager,
            {"request_version": 2, "version": 0, "reason": "Issue", "setup_version": setup_version},
        ).status_code
        == 200
    )
    assert (
        command(
            client, request_id, "void", manager, {"request_version": 2, "version": 1, "reason": "Correction"}
        ).status_code
        == 200
    )
    body = {
        "request_version": 2,
        "version": 2,
        "reason": "Replacement",
        "replacement_request_id": target_id,
        "replacement_request_version": target_version,
    }
    for code in ("vouchers.read", "workflow.review", "vouchers.replace"):
        with SessionLocal.begin() as db:
            user_id = db.scalar(select(User.id).where(User.email == "finance.manager@payment.local"))
            permission_id = db.scalar(select(Permission.id).where(Permission.code == code))
            deny = UserPermissionOverride(user_id=user_id, permission_id=permission_id, is_allowed=False)
            db.add(deny)
            db.flush()
            deny_id = deny.id
        try:
            if code != "vouchers.replace":
                assert client.get("/api/v1/finance-operations").status_code == 403
            else:
                assert client.get(f"/api/v1/finance-vouchers/{request_id}").json()["can_link_replacement"] is False
                assert command(client, request_id, "link-replacement", manager, body).status_code == 403
        finally:
            with SessionLocal.begin() as db:
                db.execute(delete(UserPermissionOverride).where(UserPermissionOverride.id == deny_id))


def clone(row, **overrides):
    fields = {
        column.name: deepcopy(getattr(row, column.name))
        for column in row.__table__.columns
        if column.name not in {"id", "created_at", "updated_at"}
    }
    return type(row)(id=uuid4(), **(fields | overrides))


def replacement_fixture(request_id):
    with SessionLocal.begin() as db:
        source = db.get(PaymentRequest, UUID(str(request_id)))
        target = clone(source, request_number=f"PR-R-{uuid4().hex[:10]}", voucher_number=None)
        db.add(target)
        db.flush()
        workflow = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == source.id))
        db.add(clone(workflow, request_id=target.id))
        tax = db.scalar(select(FinanceTaxSnapshot).where(FinanceTaxSnapshot.request_id == source.id))
        new_tax = clone(tax, request_id=target.id, command_key=str(uuid4()))
        db.add(new_tax)
        db.flush()
        journal = db.scalar(
            select(FinanceJournalSnapshot).where(
                FinanceJournalSnapshot.request_id == source.id,
                FinanceJournalSnapshot.state == "posted",
            )
        )
        new_journal = clone(
            journal,
            request_id=target.id,
            tax_snapshot_id=new_tax.id,
            command_key=str(uuid4()),
        )
        db.add(new_journal)
        db.flush()
        voucher = db.scalar(select(FinanceVoucherDraft).where(FinanceVoucherDraft.request_id == source.id))
        db.add(
            clone(
                voucher,
                request_id=target.id,
                journal_id=new_journal.id,
                command_key=str(uuid4()),
            )
        )
        return str(target.id), target.version


def test_queue_role_scope_filters_and_voucher_currency_totals(client, prepared_voucher):  # noqa: F811
    request_id, setup_version, _, voucher = prepared_voucher
    manager = login(client, "finance.manager@payment.local")
    result = client.get(
        "/api/v1/finance-operations",
        params={
            "phase": "voucher",
            "search": voucher["result"]["request_number"],
            "page_size": 1,
        },
    )
    assert result.status_code == 200, result.text
    data = result.json()
    assert data["total"] == 1 and data["items"][0]["request_id"] == str(request_id)
    assert Decimal(data["page_totals"]["PHP"]["due"]) == Decimal(voucher["result"]["totals"]["amount_due"])
    assert client.get("/api/v1/finance-operations?page=0").status_code == 422
    assert client.get("/api/v1/finance-operations?line_state=released").json()["items"] == []
    body = {
        "request_version": 2,
        "version": 0,
        "setup_version": setup_version,
        "reason": "Issue",
    }
    assert command(client, request_id, "issue", manager, body).status_code == 200
    assert (
        command(
            client,
            request_id,
            "void",
            manager,
            {"request_version": 2, "version": 1, "reason": "Correction"},
        ).status_code
        == 200
    )
    voided = client.get(
        "/api/v1/finance-operations",
        params={"phase": "voided", "search": voucher["result"]["request_number"]},
    ).json()
    assert voided["total"] == 1 and voided["page_totals"] == {}
    login(client, "requestor@payment.local")
    assert client.get("/api/v1/finance-operations").status_code == 403


def test_replacement_guards_retry_and_bidirectional_history(client, prepared_voucher):  # noqa: F811
    request_id, setup_version, _, _ = prepared_voucher
    target_id, target_version = replacement_fixture(request_id)
    manager = login(client, "finance.manager@payment.local")
    body = {
        "request_version": 2,
        "version": 0,
        "reason": "Corrected replacement",
        "replacement_request_id": target_id,
        "replacement_request_version": target_version,
    }
    assert command(client, request_id, "link-replacement", manager, body).status_code == 409
    assert (
        command(
            client,
            request_id,
            "issue",
            manager,
            {
                "request_version": 2,
                "version": 0,
                "reason": "Issue",
                "setup_version": setup_version,
            },
        ).status_code
        == 200
    )
    assert (
        command(
            client,
            request_id,
            "void",
            manager,
            {"request_version": 2, "version": 1, "reason": "Correction"},
        ).status_code
        == 200
    )
    body["version"] = 2
    assert (
        command(
            client,
            request_id,
            "link-replacement",
            manager,
            {**body, "replacement_request_id": str(request_id)},
        ).status_code
        == 422
    )
    assert (
        command(
            client,
            request_id,
            "link-replacement",
            manager,
            {**body, "replacement_request_version": target_version + 1},
        ).status_code
        == 409
    )
    associate = login(client, "finance.associate@payment.local")
    assert command(client, request_id, "link-replacement", associate, body).status_code == 403
    manager = login(client, "finance.manager@payment.local")
    view = client.get(f"/api/v1/finance-vouchers/{request_id}").json()
    assert any(row["id"] == target_id for row in view["replacement_candidates"])
    key = str(uuid4())
    linked = command(client, request_id, "link-replacement", manager, body, key)
    assert linked.status_code == 200, linked.text
    assert command(client, request_id, "link-replacement", manager, body, key).json() == linked.json()
    assert (
        command(
            client,
            request_id,
            "link-replacement",
            manager,
            {**body, "reason": "Different"},
            key,
        ).status_code
        == 409
    )
    assert command(client, request_id, "link-replacement", manager, body).status_code == 409
    assert (
        client.get(f"/api/v1/finance-vouchers/{request_id}").json()["replacement_links"][0]["direction"]
        == "replaced_by"
    )
    assert (
        client.get(f"/api/v1/finance-vouchers/{target_id}").json()["replacement_links"][0]["direction"]
        == "replacement_for"
    )
    assert (
        client.get(f"/api/v1/finance-vouchers/{request_id}/print-data").json()["replacement_links"][0][
            "replacement_request_id"
        ]
        == target_id
    )
    with SessionLocal() as db:
        assert (
            db.scalar(
                select(FinanceVoucherReplacement).where(
                    FinanceVoucherReplacement.original_request_id == UUID(str(request_id))
                )
            ).reason
            == body["reason"]
        )
