from uuid import UUID, uuid4

import pytest
from payment_module.database import SessionLocal
from payment_module.models import (
    FinanceJournalSnapshot,
    FinanceVoucherEvent,
    PaymentInstruction,
    PaymentMethod,
    Permission,
    User,
    UserPermissionOverride,
)
from sqlalchemy import delete, select
from test_finance_accounting import accounting_request  # noqa: F401
from test_finance_accounting import command as accounting_command
from test_finance_tax import setup_tax  # noqa: F401
from test_finance_validation import login


def command(client, request_id, action, headers, body, key=None):
    return client.post(
        f"/api/v1/finance-vouchers/{request_id}/{action}",
        json=body,
        headers={**headers, "Idempotency-Key": key or str(uuid4())},
    )


@pytest.fixture()
def prepared_voucher(client, accounting_request):  # noqa: F811
    request_id, line_id, accounts, associate = accounting_request
    body = {"request_version": 2, "version": 0, "tax_version": 1, "reason": "Prepare"}
    assert accounting_command(client, request_id, "draft", associate, body).status_code == 200
    accepted = client.post(
        f"/api/v1/finance-validation/{request_id}/lines/{line_id}/reviews",
        headers=associate,
        json={"request_version": 2, "decision": "accepted"},
    )
    assert accepted.status_code == 201
    approval = client.post(
        f"/api/v1/workflow/{request_id}/approve",
        headers={**associate, "Idempotency-Key": str(uuid4())},
        json={"version": 2},
    )
    assert approval.status_code == 200
    manager = login(client, "finance.manager@payment.local")
    approval = client.post(
        f"/api/v1/workflow/{request_id}/approve",
        headers={**manager, "Idempotency-Key": str(uuid4())},
        json={"version": 3},
    )
    assert approval.status_code == 200
    posted = accounting_command(client, request_id, "post", manager, {**body, "version": 1})
    assert posted.status_code == 200
    setup = client.get("/api/v1/request-settings/finance-setup").json()
    saved = client.put(
        "/api/v1/request-settings/finance-setup",
        headers=manager,
        json={
            **setup,
            "voucher": {
                "prefix": "PV",
                "reset_basis": "calendar_year",
                "certification_text": "Finance certifies these entries.",
                "create_role": "finance_associate",
                "post_role": "finance_manager",
                "void_role": "finance_manager",
            },
        },
    )
    assert saved.status_code == 200
    associate = login(client, "finance.associate@payment.local")
    voucher = accounting_command(client, request_id, "voucher", associate, {**body, "version": 2})
    assert voucher.status_code == 200
    yield request_id, saved.json()["version"], posted.json(), voucher.json()
    with SessionLocal.begin() as db:
        db.execute(delete(PaymentInstruction).where(PaymentInstruction.request_id == request_id))
        db.execute(delete(FinanceVoucherEvent).where(FinanceVoucherEvent.request_id == request_id))


def test_issue_assign_authorize_void_preserves_sources_and_reverses(client, prepared_voucher):
    request_id, setup_version, posted, voucher = prepared_voucher
    url = f"/api/v1/finance-vouchers/{request_id}"
    signatory = login(client, "signatory@payment.local")
    for endpoint in (url, f"/api/v1/requests/{request_id}", f"/api/v1/requests/{request_id}/conversation"):
        assert client.get(endpoint).status_code == 404
    manager = login(client, "finance.manager@payment.local")
    body = {"request_version": 2, "version": 0, "reason": "Certified", "setup_version": setup_version}
    key = str(uuid4())
    issued = command(client, request_id, "issue", manager, body, key)
    assert issued.status_code == 200, issued.text
    assert issued.json()["result"]["voucher_number"].startswith("PV-")
    assert command(client, request_id, "issue", manager, body, key).json() == issued.json()
    assert command(client, request_id, "issue", manager, {**body, "reason": "Changed"}, key).status_code == 409
    assert client.get(url + "/print-data").json()["entries"] == posted["result"]["entries"]
    with SessionLocal() as db:
        signatory_id = db.scalar(select(User.id).where(User.email == "signatory@payment.local"))
        method_id = db.scalar(select(PaymentMethod.id).where(PaymentMethod.code == "BANK_TRANSFER"))
    associate = login(client, "finance.associate@payment.local")
    instruction_body = {
        "request_version": 2,
        "version": 1,
        "reason": "Recorded payment instruction",
        "method_id": str(method_id),
        "signatory_user_id": str(signatory_id),
        "reference": f"TX-{uuid4().hex[:12]}",
    }
    payment_key = str(uuid4())
    prepared = command(client, request_id, "prepare-payment", associate, instruction_body, payment_key)
    assert prepared.status_code == 200, prepared.text
    assert prepared.json()["result"]["instruction"]["amount"] == "1100.00"
    assert (
        command(client, request_id, "prepare-payment", associate, instruction_body, payment_key).json()
        == prepared.json()
    )
    signatory = login(client, "signatory@payment.local")
    assert client.get(f"/api/v1/requests/{request_id}").status_code == 200
    assert client.get(f"/api/v1/requests/{request_id}/conversation").status_code == 200
    assert any(
        row["request_id"] == str(request_id) and row["pending"]
        for row in client.get("/api/v1/finance-vouchers/queue").json()
    )
    authorize_body = {"request_version": 2, "version": 2, "reason": "Authorize recorded instruction"}
    authorize_key = str(uuid4())
    authorized = command(client, request_id, "authorize", signatory, authorize_body, authorize_key)
    assert authorized.status_code == 200, authorized.text
    assert (
        command(client, request_id, "authorize", signatory, authorize_body, authorize_key).json() == authorized.json()
    )
    assert command(client, request_id, "authorize", signatory, {**authorize_body, "version": 3}).status_code == 409
    manager = login(client, "finance.manager@payment.local")
    void_body = {"request_version": 2, "version": 3, "reason": "Void before release"}
    void_key = "v" * 100
    voided = command(client, request_id, "void", manager, void_body, void_key)
    assert voided.status_code == 200, voided.text
    assert voided.json()["result"]["payment_authorization"] == "invalidated"
    assert command(client, request_id, "void", manager, void_body, void_key).json() == voided.json()
    print_view = client.get(url + "/print-data").json()
    assert print_view["current_state"] == "voided"
    assert print_view["voucher_number"] == issued.json()["result"]["voucher_number"]
    assert print_view["totals"]["amount_due"] == "1100.00"
    accounting = client.get(f"/api/v1/finance-accounting/{request_id}").json()
    assert accounting["saved"]["state"] == "reversed"
    assert not accounting["can_prepare"] and not accounting["can_post"]
    original = posted["result"]["entries"]
    reversal = accounting["saved"]["result"]["entries"]
    assert all(a["debit"] == b["credit"] and a["credit"] == b["debit"] for a, b in zip(original, reversal, strict=True))
    with SessionLocal() as db:
        assert db.get(FinanceJournalSnapshot, UUID(posted["id"])).result == posted["result"]
    signatory = login(client, "signatory@payment.local")
    assert command(client, request_id, "authorize", signatory, {**authorize_body, "version": 4}).status_code == 409
    owner = login(client, "requestor@payment.local")
    cancelled = client.post(
        f"/api/v1/requests/{request_id}/cancel", headers=owner, json={"version": 2, "note": "Cancel the voided request"}
    )
    assert cancelled.status_code == 200
    manager = login(client, "finance.manager@payment.local")
    reopened = client.post(
        f"/api/v1/requests/{request_id}/reopen",
        headers=manager,
        json={"version": cancelled.json()["version"], "note": "Try reusing reversed accounting"},
    )
    assert reopened.status_code == 409 and "new request" in reopened.text


def test_settings_stale_versions_role_denials_and_immutable_print(client, prepared_voucher):
    request_id, setup_version, posted, voucher = prepared_voucher
    body = {"request_version": 2, "version": 0, "reason": "Issue", "setup_version": setup_version}
    associate = login(client, "finance.associate@payment.local")
    assert command(client, request_id, "issue", associate, body).status_code == 403
    assert client.get(f"/api/v1/finance-vouchers/{request_id}/print-data").status_code == 409
    manager = login(client, "finance.manager@payment.local")
    assert command(client, request_id, "issue", manager, {**body, "setup_version": 1}).status_code == 409
    assert command(client, request_id, "issue", manager, {**body, "reason": " "}).status_code == 422
    with SessionLocal.begin() as db:
        user_id = db.scalar(select(User.id).where(User.email == "finance.manager@payment.local"))
        permission_id = db.scalar(select(Permission.id).where(Permission.code == "vouchers.issue"))
        deny = UserPermissionOverride(user_id=user_id, permission_id=permission_id, is_allowed=False)
        db.add(deny)
        db.flush()
        deny_id = deny.id
    try:
        assert command(client, request_id, "issue", manager, body).status_code == 403
    finally:
        with SessionLocal.begin() as db:
            db.execute(delete(UserPermissionOverride).where(UserPermissionOverride.id == deny_id))
    issued = command(client, request_id, "issue", manager, body)
    assert issued.status_code == 200
    settings = client.get("/api/v1/request-settings/finance-setup").json()
    assert (
        client.put(
            "/api/v1/request-settings/finance-setup",
            headers=manager,
            json={
                **settings,
                "voucher": {
                    **settings["voucher"],
                    "certification_text": "Changed after issue",
                },
            },
        ).status_code
        == 200
    )

    assert (
        client.get(f"/api/v1/finance-vouchers/{request_id}/print-data").json()["certification_text"]
        == "Finance certifies these entries."
    )


def test_payment_eligibility_permissions_and_expired_method(client, prepared_voucher):
    request_id, setup_version, _, _ = prepared_voucher
    manager = login(client, "finance.manager@payment.local")
    assert (
        command(
            client,
            request_id,
            "issue",
            manager,
            {
                "request_version": 2,
                "version": 0,
                "setup_version": setup_version,
                "reason": "Issue",
            },
        ).status_code
        == 200
    )
    with SessionLocal() as db:
        signatory_id = db.scalar(select(User.id).where(User.email == "signatory@payment.local"))
        associate_id = db.scalar(select(User.id).where(User.email == "finance.associate@payment.local"))
        method_id = db.scalar(select(PaymentMethod.id).where(PaymentMethod.code == "BANK_TRANSFER"))
    associate = login(client, "finance.associate@payment.local")
    body = {
        "request_version": 2,
        "version": 1,
        "reason": "Prepare",
        "method_id": str(method_id),
        "signatory_user_id": str(signatory_id),
        "reference": f"TX-{uuid4().hex[:12]}",
    }
    assert (
        command(
            client, request_id, "prepare-payment", associate, {**body, "signatory_user_id": str(associate_id)}
        ).status_code
        == 422
    )
    assert (
        command(client, request_id, "prepare-payment", associate, {**body, "method_id": str(uuid4())}).status_code
        == 422
    )
    assert command(client, request_id, "prepare-payment", associate, {**body, "reference": " "}).status_code == 422
    assert command(client, request_id, "prepare-payment", associate, body).status_code == 200
    authorization = {"request_version": 2, "version": 2, "reason": "Authorize"}
    assert command(client, request_id, "authorize", associate, authorization).status_code == 403
    with SessionLocal.begin() as db:
        permission_id = db.scalar(select(Permission.id).where(Permission.code == "payments.authorize"))
        deny = UserPermissionOverride(user_id=signatory_id, permission_id=permission_id, is_allowed=False)
        db.add(deny)
        db.flush()
        deny_id = deny.id
    try:
        signatory = login(client, "signatory@payment.local")
        assert command(client, request_id, "authorize", signatory, authorization).status_code == 403
        assert client.get("/api/v1/finance-vouchers/queue").json() == []
    finally:
        with SessionLocal.begin() as db:
            db.execute(delete(UserPermissionOverride).where(UserPermissionOverride.id == deny_id))
    signatory = login(client, "signatory@payment.local")
    with SessionLocal.begin() as db:
        db.get(PaymentMethod, method_id).is_active = False
    try:
        blocked = command(client, request_id, "authorize", signatory, authorization)
        assert blocked.status_code == 409 and "no longer active" in blocked.text
    finally:
        with SessionLocal.begin() as db:
            db.get(PaymentMethod, method_id).is_active = True
    assert command(client, request_id, "authorize", signatory, {**authorization, "version": 1}).status_code == 409
    assert command(client, request_id, "authorize", signatory, authorization).status_code == 200


def test_incomplete_setup_blocks_issue_and_void_draft_has_no_formal_print(client, prepared_voucher):
    request_id, _, _, _ = prepared_voucher
    manager = login(client, "finance.manager@payment.local")
    setup = client.get("/api/v1/request-settings/finance-setup").json()
    saved = client.put(
        "/api/v1/request-settings/finance-setup",
        headers=manager,
        json={
            **setup,
            "voucher": {**setup["voucher"], "certification_text": ""},
        },
    )
    assert saved.status_code == 200
    body = {"request_version": 2, "version": 0, "reason": "Issue", "setup_version": saved.json()["version"]}
    blocked = command(client, request_id, "issue", manager, body)
    assert blocked.status_code == 409 and "Certification wording" in blocked.text
    view = client.get(f"/api/v1/finance-vouchers/{request_id}").json()
    assert view["version"] == 0 and view["blockers"]
    voided = command(client, request_id, "void", manager, {"request_version": 2, "version": 0, "reason": "Void draft"})
    assert voided.status_code == 200
    view = client.get(f"/api/v1/finance-vouchers/{request_id}").json()
    assert view["state"] == "voided" and not view["can_print"]
    assert client.get(f"/api/v1/finance-vouchers/{request_id}/print-data").status_code == 409
