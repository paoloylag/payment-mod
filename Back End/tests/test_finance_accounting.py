import json
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from payment_module.database import SessionLocal
from payment_module.models import (
    ChartAccount,
    CostCenter,
    Document,
    FinanceJournalSnapshot,
    FinanceVoucherDraft,
    PaymentRequest,
    PaymentRequestLine,
    SystemSetting,
    WorkflowInstance,
)
from sqlalchemy import delete, select
from test_finance_tax import save as save_tax
from test_finance_tax import setup_tax  # noqa: F401
from test_finance_validation import advance_to_finance, login, submitted_request


@pytest.fixture()
def accounting_request(client, setup_tax):  # noqa: F811
    request_id, line_id = submitted_request()
    with SessionLocal.begin() as db:
        accounts = []
        for label, kind, side in (
            ("Expense", "expense", "debit"),
            ("VAT", "asset", "debit"),
            ("EWT", "liability", "credit"),
            ("Payable", "liability", "credit"),
        ):
            account = ChartAccount(
                code=f"J-{uuid4().hex[:8]}",
                name=f"{label} {uuid4().hex[:8]}",
                account_type=kind,
                normal_balance=side,
                is_posting=True,
            )
            db.add(account)
            db.flush()
            accounts.append(str(account.id))
        item = db.get(PaymentRequest, request_id)
        item.gross_amount = Decimal("1120")
        line = db.get(PaymentRequestLine, line_id)
        line.amount = Decimal("1120")
        line.chart_account_id = UUID(accounts[0])
        line.cost_center_id = db.scalar(select(CostCenter.id).where(CostCenter.department_id == item.department_id))
        setting = db.scalar(select(SystemSetting).where(SystemSetting.key == "finance.setup.draft"))
        config = json.loads(setting.value)
        config["accounts_by_request_type"] = {
            "general": dict(
                zip(
                    ("debit_account_id", "input_vat_account_id", "ewt_payable_account_id", "credit_account_id"),
                    accounts,
                    strict=True,
                )
            )
        }
        setting.value = json.dumps(config)
    advance_to_finance(client, request_id)
    associate = login(client, "finance.associate@payment.local")
    response = save_tax(client, request_id, associate, {"request_version": 2, "version": 0, "reason": "Apply default"})
    assert response.status_code == 200, response.text
    yield request_id, line_id, accounts, associate
    with SessionLocal.begin() as db:
        db.execute(delete(FinanceVoucherDraft).where(FinanceVoucherDraft.request_id == request_id))
        db.execute(delete(FinanceJournalSnapshot).where(FinanceJournalSnapshot.request_id == request_id))
        db.execute(delete(PaymentRequest).where(PaymentRequest.id == request_id))
        db.execute(delete(ChartAccount).where(ChartAccount.id.in_([UUID(value) for value in accounts])))


def command(client, request_id, action, headers, body, key=None):
    return client.post(
        f"/api/v1/finance-accounting/{request_id}/{action}",
        json=body,
        headers={**headers, "Idempotency-Key": key or str(uuid4())},
    )


def test_journal_corrections_posting_voucher_and_immutable_sources(client, accounting_request):
    request_id, line_id, accounts, associate = accounting_request
    url = f"/api/v1/finance-accounting/{request_id}"
    preview = client.get(url).json()
    assert preview["preview"]["totals"] == {"debit": "1120.00", "credit": "1120.00", "difference": "0.00"}
    assert len(preview["preview"]["entries"]) == 4
    body = {"request_version": 2, "version": 0, "tax_version": 1, "reason": "Prepared from billing"}
    key = str(uuid4())
    first = command(client, request_id, "draft", associate, body, key)
    assert first.status_code == 200, first.text
    assert command(client, request_id, "draft", associate, body, key).json() == first.json()
    assert command(client, request_id, "draft", associate, {**body, "reason": "Changed"}, key).status_code == 409
    correction = {
        **body,
        "version": 1,
        "reason": "Correct expense account",
        "account_overrides": {f"{line_id}:expense": accounts[1]},
    }
    second = command(client, request_id, "draft", associate, correction)
    assert second.status_code == 200, second.text
    assert second.json()["result"]["entries"][0]["account"]["id"] == accounts[1]
    assert client.get(url).json()["history"][1] == first.json()
    assert command(client, request_id, "post", associate, {**body, "version": 2}).status_code == 403
    reviewed = client.post(
        f"/api/v1/finance-validation/{request_id}/lines/{line_id}/reviews",
        headers=associate,
        json={"request_version": 2, "decision": "accepted"},
    )
    assert reviewed.status_code == 201
    approved = client.post(
        f"/api/v1/workflow/{request_id}/approve",
        headers={**associate, "Idempotency-Key": str(uuid4())},
        json={"version": 2},
    )
    assert approved.status_code == 200, approved.text
    manager = login(client, "finance.manager@payment.local")
    post_body = {**body, "version": 2, "reason": "Reviewed balanced entries"}
    assert command(client, request_id, "post", manager, post_body).status_code == 409
    # Complete the real final approval endpoint, rather than setting workflow state directly.
    workflow = client.get(f"/api/v1/workflow/{request_id}").json()
    final = client.post(
        f"/api/v1/workflow/{request_id}/approve",
        headers={**manager, "Idempotency-Key": str(uuid4())},
        json={"version": workflow["version"]},
    )
    assert final.status_code == 200, final.text
    assert final.json()["state"] == "approved"
    post_key = str(uuid4())
    posted = command(client, request_id, "post", manager, post_body, post_key)
    assert posted.status_code == 200, posted.text
    assert command(client, request_id, "post", manager, post_body, post_key).json() == posted.json()
    assert command(client, request_id, "post", manager, {**post_body, "version": 3}).status_code == 409
    assert command(client, request_id, "draft", manager, {**body, "version": 3}).status_code == 403
    associate = login(client, "finance.associate@payment.local")
    assert command(client, request_id, "draft", associate, {**body, "version": 3}).status_code == 409
    voucher_body = {**body, "version": 3, "reason": "Prepared voucher from posted entries"}
    voucher_key = str(uuid4())
    voucher = command(client, request_id, "voucher", associate, voucher_body, voucher_key)
    assert voucher.status_code == 200, voucher.text
    assert voucher.json()["result"]["totals"]["amount_due"] == "1100.00"
    assert voucher.json()["result"]["entries"] == posted.json()["result"]["entries"]
    assert command(client, request_id, "voucher", associate, voucher_body, voucher_key).json() == voucher.json()
    assert command(client, request_id, "voucher", associate, voucher_body).status_code == 409
    with SessionLocal() as db:
        document_id = db.scalar(select(Document.id).where(Document.request_id == request_id))
    frozen_review = client.post(
        f"/api/v1/documents/{document_id}/reviews",
        headers=associate,
        json={"decision": "rejected", "comment": "Try changing posted review"},
    )
    assert frozen_review.status_code == 409
    assert "frozen" in frozen_review.text
    owner = login(client, "requestor@payment.local")
    assert client.get(url).status_code == 404
    cancelled = client.post(
        f"/api/v1/requests/{request_id}/cancel", headers=owner, json={"version": 2, "note": "Cancel posted request"}
    )
    assert cancelled.status_code == 409
    with SessionLocal() as db:
        assert db.get(PaymentRequest, request_id).status == "submitted"


def test_stale_sources_and_invalid_corrections_are_rejected(client, accounting_request):
    request_id, line_id, accounts, associate = accounting_request
    body = {"request_version": 2, "version": 0, "tax_version": 1, "reason": "Initial"}
    assert (
        command(
            client, request_id, "draft", associate, {**body, "account_overrides": {"foreign:expense": accounts[0]}}
        ).status_code
        == 422
    )
    assert command(client, request_id, "draft", associate, {**body, "tax_version": 9}).status_code == 409
    assert command(client, request_id, "draft", associate, {**body, "reason": " "}).status_code == 422
    assert (
        command(
            client, request_id, "draft", associate, {**body, "account_overrides": {f"{line_id}:expense": str(uuid4())}}
        ).status_code
        == 409
    )
    assert command(client, request_id, "draft", associate, {**body, "entries": []}).status_code == 422
    first = command(client, request_id, "draft", associate, body)
    assert first.status_code == 200
    saved_tax = save_tax(
        client, request_id, associate, {"request_version": 2, "version": 1, "reason": "New EWT calculation"}
    )
    assert saved_tax.status_code == 200
    view = client.get(f"/api/v1/finance-accounting/{request_id}").json()
    assert view["stale"]
    assert view["saved"] == first.json()
    assert command(client, request_id, "draft", associate, {**body, "version": 1}).status_code == 409
    revised = command(client, request_id, "draft", associate, {**body, "version": 1, "tax_version": 2})
    assert revised.status_code == 200
    accepted = client.post(
        f"/api/v1/finance-validation/{request_id}/lines/{line_id}/reviews",
        headers=associate,
        json={"request_version": 2, "decision": "accepted"},
    )
    assert accepted.status_code == 201
    manager = login(client, "finance.manager@payment.local")
    assert client.get(f"/api/v1/finance-accounting/{request_id}").status_code == 404  # Not reached yet.
    with SessionLocal.begin() as db:
        instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id))
        instance.current_stage = None
        instance.state = "approved"
        db.get(ChartAccount, UUID(accounts[0])).is_active = False
    manager = login(client, "finance.manager@payment.local")
    blocked = command(client, request_id, "post", manager, {**body, "version": 2, "tax_version": 2})
    assert blocked.status_code == 409
    assert "no longer active" in blocked.text
    with SessionLocal() as db:
        latest = db.scalar(
            select(FinanceJournalSnapshot)
            .where(FinanceJournalSnapshot.request_id == request_id)
            .order_by(FinanceJournalSnapshot.version.desc())
            .limit(1)
        )
        assert latest.state == "draft"


def test_no_ewt_omits_withholding_entry_and_unbalanced_post_is_blocked(client, accounting_request, setup_tax):  # noqa: F811
    request_id, line_id, accounts, associate = accounting_request
    changed = save_tax(
        client,
        request_id,
        associate,
        {
            "request_version": 2,
            "version": 1,
            "request_ewt_tax_id": setup_tax["NONVAT"],
            "reason": "No EWT applies",
        },
    )
    assert changed.status_code == 200
    body = {"request_version": 2, "version": 0, "tax_version": 2, "reason": "No EWT draft"}
    saved = command(client, request_id, "draft", associate, body)
    assert saved.status_code == 200
    assert len(saved.json()["result"]["entries"]) == 3
    assert saved.json()["result"]["tax_totals"]["vat"] == "120.00"
    assert saved.json()["result"]["tax_totals"]["amount_due"] == "1120.00"
    accepted = client.post(
        f"/api/v1/finance-validation/{request_id}/lines/{line_id}/reviews",
        headers=associate,
        json={"request_version": 2, "decision": "accepted"},
    )
    assert accepted.status_code == 201
    with SessionLocal.begin() as db:
        instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id))
        instance.state = "approved"
        instance.current_stage = None
        row = db.get(FinanceJournalSnapshot, UUID(saved.json()["id"]))
        corrupted = json.loads(json.dumps(row.result))
        corrupted["entries"][0]["debit"] = "999.00"
        row.result = corrupted
    manager = login(client, "finance.manager@payment.local")
    blocked = command(client, request_id, "post", manager, {**body, "version": 1})
    assert blocked.status_code == 409
    assert "not balanced" in blocked.text
