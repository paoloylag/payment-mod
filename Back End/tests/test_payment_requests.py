from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from decimal import Decimal
from threading import Barrier
from time import perf_counter
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from payment_module.database import SessionLocal, engine
from payment_module.main import app
from payment_module.models import (
    AuditEvent,
    ChartAccount,
    CostCenter,
    Department,
    PaymentRequest,
    PaymentRequestLine,
    Permission,
    User,
    UserPermissionOverride,
)
from payment_module.routers.requests import academic_year_start
from payment_module.seed import seed
from sqlalchemy import event, func, select

PASSWORD = "Phase01-Test-Only!"


def login(client, email="requestor@payment.local"):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200
    return {"X-CSRF-Token": response.json()["csrf_token"]}


def payload(currency="PHP"):
    with SessionLocal() as db:
        department_id = db.scalar(select(Department.id).where(Department.code == "MKTG"))
        cost_center_id = db.scalar(select(CostCenter.id).where(CostCenter.code == "MKTG"))
        chart_account = db.scalar(select(ChartAccount).where(ChartAccount.code == "TEST-EXPENSE"))
        if chart_account is None:
            chart_account = ChartAccount(
                code="TEST-EXPENSE",
                name="Test Expense Account",
                description="Isolated automated-test account",
                account_type="expense",
                is_posting=True,
                normal_balance="debit",
            )
            db.add(chart_account)
            db.commit()
            db.refresh(chart_account)
        chart_account_id = chart_account.id
    return {
        "request_type": "reimbursement",
        "department_id": str(department_id),
        "payee_name": "Sample Merchant",
        "purpose": "Phase 03 automated request test",
        "currency_code": currency,
        "type_data": {"source": "test", "proof_of_payment_refs": ["proof-of-payment.pdf"]},
        "lines": [
            {
                "invoice_number": f"INV-{uuid4()}",
                "invoice_date": "2026-09-01",
                "vendor_name": "Sample Merchant",
                "particulars": "Supplies",
                "chart_account_id": str(chart_account_id),
                "cost_center_id": str(cost_center_id),
                "amount": "1250.50",
                "currency_code": currency,
                "attachment_refs": ["invoice.pdf"],
            }
        ],
    }


def payload_for_type(request_type: str):
    result = payload()
    result["request_type"] = request_type
    result["lines"][0]["invoice_number"] = f"REF-{uuid4()}"
    if request_type == "cashAdvance":
        result["payee_name"] = "Development Requestor"
        result["type_data"] = {
            "event_end_date": "2026-09-15",
            "liquidation_due_date": "2026-09-30",
            "accountability_acknowledged": True,
        }
        result["lines"][0].update(
            {
                "invoice_date": None,
                "invoice_number": None,
                "vendor_name": "",
                "chart_account_id": None,
                "cost_center_id": None,
                "attachment_refs": [],
            }
        )
    elif request_type == "liquidation":
        result["type_data"] = {
            "cash_advance_reference": "CA-2026-000049",
            "liquidation_due_date": "2026-09-30",
            "actual_liquidation_date": "2026-09-28",
            "liquidation_advance_amount": "1500.00",
            "proof_of_return_refs": ["return-proof.pdf"],
        }
    elif request_type == "poPayment":
        result["payee_name"] = "Approved Supplier"
        result["type_data"] = {"po_reference": "PO-2026-0106", "approved_po_refs": ["approved-po.pdf"]}
        result["lines"][0].update(
            {
                "invoice_date": None,
                "invoice_number": "PO-2026-0106",
                "vendor_name": "Approved Supplier",
                "attachment_refs": ["approved-po.pdf"],
            }
        )
    elif request_type == "general":
        result["payee_name"] = "Utility Provider"
        result["type_data"] = {"billing_document_refs": ["utility-bill.pdf"]}
        result["lines"][0].update(
            {
                "invoice_date": None,
                "invoice_number": None,
                "vendor_name": "Utility Provider",
                "attachment_refs": ["utility-bill.pdf"],
            }
        )
    return result


def test_request_crud_optimistic_lock_and_idempotent_submit(client):
    seed()
    headers = login(client)
    created = client.post("/api/v1/requests", json=payload(), headers=headers)
    assert created.status_code == 201
    draft = created.json()
    assert draft["status"] == "draft" and draft["gross_amount"] == 1250.5
    assert draft["draft_expires_at"]
    assert draft["draft_retention_warning"] is False

    changed = payload()
    changed["version"] = draft["version"]
    changed["purpose"] = "Updated purpose"
    updated = client.patch(f"/api/v1/requests/{draft['id']}", json=changed, headers=headers)
    assert updated.status_code == 200 and updated.json()["version"] == 2
    assert client.patch(f"/api/v1/requests/{draft['id']}", json=changed, headers=headers).status_code == 409

    submit_headers = {**headers, "Idempotency-Key": str(uuid4())}
    submitted = client.post(f"/api/v1/requests/{draft['id']}/submit", json={"version": 2}, headers=submit_headers)
    repeated = client.post(f"/api/v1/requests/{draft['id']}/submit", json={"version": 2}, headers=submit_headers)
    assert submitted.status_code == 200
    assert repeated.json()["request_number"] == submitted.json()["request_number"]
    assert submitted.json()["request_number"].startswith("PR-2026-")
    assert submitted.json()["draft_expires_at"] is None
    assert submitted.json()["draft_retention_warning"] is False


def test_mixed_currency_rejected_and_visibility_enforced(client):
    seed()
    headers = login(client)
    mixed = payload()
    mixed["lines"][0]["currency_code"] = "USD"
    assert client.post("/api/v1/requests", json=mixed, headers=headers).status_code == 422

    created = client.post("/api/v1/requests", json=payload(), headers=headers).json()
    client.cookies.clear()
    other_headers = login(client, "coo@payment.local")
    assert client.get(f"/api/v1/requests/{created['id']}", headers=other_headers).status_code == 404


def test_duplicate_invoice_checks_distinguish_exact_and_warning_matches(client):
    seed()
    headers = login(client)
    invoice_number = f"INV-DUP-{uuid4()}"

    original_payload = payload()
    original_payload["lines"][0]["invoice_number"] = invoice_number
    original = client.post("/api/v1/requests", json=original_payload, headers=headers).json()
    original = client.post(
        f"/api/v1/requests/{original['id']}/submit",
        json={"version": original["version"]},
        headers={**headers, "Idempotency-Key": str(uuid4())},
    ).json()
    assert original["type_data"]["duplicate_invoice_review_status"] == "no_match"

    exact_payload = payload()
    exact_payload["lines"][0]["invoice_number"] = f"  {invoice_number.lower()}  "
    exact = client.post("/api/v1/requests", json=exact_payload, headers=headers).json()
    exact = client.post(
        f"/api/v1/requests/{exact['id']}/submit",
        json={"version": exact["version"]},
        headers={**headers, "Idempotency-Key": str(uuid4())},
    ).json()
    exact_checks = exact["type_data"]["duplicate_invoice_checks"]
    assert exact["type_data"]["duplicate_invoice_review_status"] == "finance_verification_required"
    assert any(check["match_level"] == "exact" for check in exact_checks)
    assert all(check["finance_verification_required"] is True for check in exact_checks)

    changed_payload = payload()
    changed_payload["lines"][0].update({"invoice_number": invoice_number, "amount": "900.00"})
    changed = client.post("/api/v1/requests", json=changed_payload, headers=headers).json()
    changed = client.post(
        f"/api/v1/requests/{changed['id']}/submit",
        json={"version": changed["version"]},
        headers={**headers, "Idempotency-Key": str(uuid4())},
    ).json()
    warning_checks = changed["type_data"]["duplicate_invoice_checks"]
    assert warning_checks
    assert all(check["match_level"] == "warning" for check in warning_checks)
    assert all("amount" in check["differing_fields"] for check in warning_checks)


def test_foreign_currency_amount_is_logged_without_conversion(client):
    seed()
    headers = login(client)
    invoice_number = f"INV-CURRENCY-{uuid4()}"

    php_payload = payload("PHP")
    php_payload["lines"][0]["invoice_number"] = invoice_number
    php = client.post("/api/v1/requests", json=php_payload, headers=headers).json()
    submitted_php = client.post(
        f"/api/v1/requests/{php['id']}/submit",
        json={"version": php["version"]},
        headers={**headers, "Idempotency-Key": str(uuid4())},
    )
    assert submitted_php.status_code == 200

    usd_payload = payload("USD")
    usd_payload["lines"][0].update({"invoice_number": invoice_number, "amount": "1250.50"})
    usd = client.post("/api/v1/requests", json=usd_payload, headers=headers).json()
    submitted_usd = client.post(
        f"/api/v1/requests/{usd['id']}/submit",
        json={"version": usd["version"]},
        headers={**headers, "Idempotency-Key": str(uuid4())},
    )
    assert submitted_usd.status_code == 200
    result = submitted_usd.json()
    assert result["currency_code"] == "USD" and result["gross_amount"] == 1250.5
    assert result["lines"][0]["currency_code"] == "USD" and result["lines"][0]["amount"] == 1250.5
    assert "converted_amount" not in result and "exchange_rate" not in result
    checks = result["type_data"]["duplicate_invoice_checks"]
    assert checks and all(check["match_level"] == "warning" for check in checks)
    assert all("currency_code" in check["differing_fields"] for check in checks)


def test_department_head_can_return_submitted_department_request(client):
    seed()
    headers = login(client)
    created = client.post("/api/v1/requests", json=payload(), headers=headers).json()
    submitted = client.post(
        f"/api/v1/requests/{created['id']}/submit",
        json={"version": created["version"]},
        headers={**headers, "Idempotency-Key": str(uuid4())},
    ).json()
    client.cookies.clear()
    head_headers = login(client, "department.head@payment.local")
    returned = client.post(
        f"/api/v1/requests/{created['id']}/return",
        json={"version": submitted["version"], "note": "Please attach the official receipt."},
        headers=head_headers,
    )
    assert returned.status_code == 200 and returned.json()["status"] == "returned"


def test_request_lifecycle_return_resubmit_cancel_and_reopen(client):
    seed()
    requestor_headers = login(client)
    created = client.post("/api/v1/requests", json=payload(), headers=requestor_headers).json()
    assert created["requestor_name"] == "Development Requestor"
    assert created["department_name"] == "Marketing"
    submitted = client.post(
        f"/api/v1/requests/{created['id']}/submit",
        json={"version": created["version"]},
        headers={**requestor_headers, "Idempotency-Key": str(uuid4())},
    ).json()

    client.cookies.clear()
    head_headers = login(client, "department.head@payment.local")
    returned = client.post(
        f"/api/v1/requests/{created['id']}/return",
        json={"version": submitted["version"], "note": "Please correct the supporting details."},
        headers=head_headers,
    )
    assert returned.status_code == 200 and returned.json()["status"] == "returned"

    client.cookies.clear()
    requestor_headers = login(client)
    resubmit_headers = {**requestor_headers, "Idempotency-Key": str(uuid4())}
    resubmitted = client.post(
        f"/api/v1/requests/{created['id']}/resubmit",
        json={"version": returned.json()["version"], "note": "Supporting details corrected."},
        headers=resubmit_headers,
    )
    repeated = client.post(
        f"/api/v1/requests/{created['id']}/resubmit",
        json={"version": returned.json()["version"], "note": "Supporting details corrected."},
        headers=resubmit_headers,
    )
    assert resubmitted.status_code == 200 and resubmitted.json()["status"] == "submitted"
    assert repeated.status_code == 200 and repeated.json()["version"] == resubmitted.json()["version"]

    cancelled = client.post(
        f"/api/v1/requests/{created['id']}/cancel",
        json={"version": resubmitted.json()["version"], "note": "Request is no longer needed."},
        headers=requestor_headers,
    )
    assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"

    client.cookies.clear()
    finance_headers = login(client, "finance.manager@payment.local")
    reopened = client.post(
        f"/api/v1/requests/{created['id']}/reopen",
        json={"version": cancelled.json()["version"], "note": "Reopened after requestor confirmation."},
        headers=finance_headers,
    )
    assert reopened.status_code == 200 and reopened.json()["status"] == "draft"


def test_academic_year_numbering_boundary_and_finance_setting(client):
    seed()
    assert academic_year_start(datetime(2027, 6, 30, tzinfo=UTC), 7) == 2026
    assert academic_year_start(datetime(2027, 7, 1, tzinfo=UTC), 7) == 2027

    requestor_headers = login(client)
    current = client.get("/api/v1/request-settings/numbering")
    assert current.status_code == 200 and current.json()["reset_month"] == 7
    denied = client.put("/api/v1/request-settings/numbering", json={"reset_month": 8}, headers=requestor_headers)
    assert denied.status_code == 403

    client.cookies.clear()
    finance_headers = login(client, "finance.associate@payment.local")
    changed = client.put("/api/v1/request-settings/numbering", json={"reset_month": 8}, headers=finance_headers)
    assert changed.status_code == 200 and changed.json()["reset_month"] == 8
    seed()
    assert client.get("/api/v1/request-settings/numbering").json()["reset_month"] == 8
    restored = client.put("/api/v1/request-settings/numbering", json={"reset_month": 7}, headers=finance_headers)
    assert restored.status_code == 200


def test_cash_advance_options_only_include_current_users_submitted_advances(client):
    seed()
    requestor_headers = login(client)
    before = client.get("/api/v1/requests/cash-advance-options").json()
    draft = client.post("/api/v1/requests", json=payload_for_type("cashAdvance"), headers=requestor_headers).json()
    assert client.get("/api/v1/requests/cash-advance-options").json() == before

    submitted = client.post(
        f"/api/v1/requests/{draft['id']}/submit",
        json={"version": draft["version"]},
        headers={**requestor_headers, "Idempotency-Key": str(uuid4())},
    )
    assert submitted.status_code == 200, submitted.text
    options = client.get("/api/v1/requests/cash-advance-options").json()
    assert submitted.json()["request_number"] in [option["request_number"] for option in options]

    client.cookies.clear()
    login(client, "department.head@payment.local")
    other_user_options = client.get("/api/v1/requests/cash-advance-options").json()
    assert submitted.json()["request_number"] not in [option["request_number"] for option in other_user_options]


def test_all_five_request_types_pass_confirmed_submission_rules(client):
    seed()
    headers = login(client)
    for request_type in ("reimbursement", "cashAdvance", "liquidation", "poPayment", "general"):
        created = client.post("/api/v1/requests", json=payload_for_type(request_type), headers=headers)
        assert created.status_code == 201, (request_type, created.text)
        submitted = client.post(
            f"/api/v1/requests/{created.json()['id']}/submit",
            json={"version": created.json()["version"]},
            headers={**headers, "Idempotency-Key": str(uuid4())},
        )
        assert submitted.status_code == 200, (request_type, submitted.text)
        assert submitted.json()["status"] == "submitted"


def test_type_specific_submission_errors_are_field_scoped(client):
    seed()
    headers = login(client)
    cases = []
    reimbursement = payload_for_type("reimbursement")
    reimbursement["lines"][0]["attachment_refs"] = []
    cases.append((reimbursement, "lines.0.attachment_refs"))
    cash_advance = payload_for_type("cashAdvance")
    cash_advance["type_data"]["accountability_acknowledged"] = False
    cases.append((cash_advance, "type_data.accountability_acknowledged"))
    liquidation = payload_for_type("liquidation")
    liquidation["type_data"].pop("cash_advance_reference")
    cases.append((liquidation, "type_data.cash_advance_reference"))
    po_payment = payload_for_type("poPayment")
    po_payment["type_data"].pop("po_reference")
    cases.append((po_payment, "type_data.po_reference"))
    general = payload_for_type("general")
    general["type_data"]["billing_document_refs"] = []
    general["lines"][0]["attachment_refs"] = []
    cases.append((general, "type_data.billing_document_refs"))

    for request_payload, expected_field in cases:
        created = client.post("/api/v1/requests", json=request_payload, headers=headers)
        assert created.status_code == 201
        submitted = client.post(
            f"/api/v1/requests/{created.json()['id']}/submit",
            json={"version": created.json()["version"]},
            headers={**headers, "Idempotency-Key": str(uuid4())},
        )
        assert submitted.status_code == 422
        assert expected_field in {error["field"] for error in submitted.json()["errors"]}


def test_general_payment_uses_complete_breakdown_rows_without_request_level_particulars(client):
    seed()
    headers = login(client)
    complete = payload_for_type("general")
    complete["purpose"] = ""
    created = client.post("/api/v1/requests", json=complete, headers=headers)
    assert created.status_code == 201
    submitted = client.post(
        f"/api/v1/requests/{created.json()['id']}/submit",
        json={"version": created.json()["version"]},
        headers={**headers, "Idempotency-Key": str(uuid4())},
    )
    assert submitted.status_code == 200

    incomplete = payload_for_type("general")
    incomplete["purpose"] = ""
    incomplete["lines"][0].update({"particulars": "", "chart_account_id": None, "cost_center_id": None})
    created = client.post("/api/v1/requests", json=incomplete, headers=headers)
    assert created.status_code == 201
    submitted = client.post(
        f"/api/v1/requests/{created.json()['id']}/submit",
        json={"version": created.json()["version"]},
        headers={**headers, "Idempotency-Key": str(uuid4())},
    )
    assert submitted.status_code == 422
    fields = {error["field"] for error in submitted.json()["errors"]}
    assert {"lines.0.particulars", "lines.0.chart_account_id", "lines.0.cost_center_id"} <= fields


def test_line_totals_reconcile_with_exact_four_decimal_precision(client):
    seed()
    headers = login(client)
    request_payload = payload()
    second_line = dict(request_payload["lines"][0])
    request_payload["lines"][0]["amount"] = "10.0050"
    second_line.update({"invoice_number": f"INV-{uuid4()}", "amount": "0.0050"})
    request_payload["lines"].append(second_line)

    created = client.post("/api/v1/requests", json=request_payload, headers=headers)

    assert created.status_code == 201
    assert created.json()["gross_amount"] == 10.01
    assert sum(Decimal(str(line["amount"])) for line in created.json()["lines"]) == Decimal("10.010")
    with SessionLocal() as db:
        stored_total = db.scalar(
            select(PaymentRequest.gross_amount).where(PaymentRequest.id == created.json()["id"])
        )
        stored_line_total = db.scalar(
            select(func.sum(PaymentRequestLine.amount)).where(PaymentRequestLine.request_id == created.json()["id"])
        )
    assert stored_total == Decimal("10.0100")
    assert stored_line_total == stored_total


def test_amounts_beyond_supported_precision_are_rejected(client):
    seed()
    headers = login(client)
    request_payload = payload()
    request_payload["lines"][0]["amount"] = "1.00001"

    response = client.post("/api/v1/requests", json=request_payload, headers=headers)

    assert response.status_code == 422


def _concurrent_request(barrier: Barrier, method: str, path: str, *, json: dict, idempotency_key: str | None = None):
    with TestClient(app) as concurrent_client:
        headers = login(concurrent_client)
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        barrier.wait()
        return concurrent_client.request(method, path, json=json, headers=headers)


def test_simultaneous_edits_allow_exactly_one_version_to_commit(client):
    seed()
    headers = login(client)
    draft = client.post("/api/v1/requests", json=payload(), headers=headers).json()
    changes = []
    for purpose in ("Concurrent edit A", "Concurrent edit B"):
        changed = payload()
        changed.update({"version": draft["version"], "purpose": purpose})
        changes.append(changed)
    barrier = Barrier(2)

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(
            pool.map(
                lambda changed: _concurrent_request(
                    barrier, "PATCH", f"/api/v1/requests/{draft['id']}", json=changed
                ),
                changes,
            )
        )

    assert sorted(response.status_code for response in responses) == [200, 409]
    assert next(response for response in responses if response.status_code == 200).json()["version"] == 2


def test_duplicate_submission_race_is_idempotent(client):
    seed()
    headers = login(client)
    draft = client.post("/api/v1/requests", json=payload(), headers=headers).json()
    idempotency_key = str(uuid4())
    barrier = Barrier(2)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(
                _concurrent_request,
                barrier,
                "POST",
                f"/api/v1/requests/{draft['id']}/submit",
                json={"version": draft["version"]},
                idempotency_key=idempotency_key,
            )
            for _ in range(2)
        ]
        responses = [future.result() for future in futures]

    assert [response.status_code for response in responses] == [200, 200]
    assert len({response.json()["request_number"] for response in responses}) == 1
    assert len({response.json()["version"] for response in responses}) == 1


def test_concurrent_submissions_receive_unique_sequential_numbers(client):
    seed()
    headers = login(client)
    drafts = [client.post("/api/v1/requests", json=payload(), headers=headers).json() for _ in range(6)]
    barrier = Barrier(len(drafts))

    with ThreadPoolExecutor(max_workers=len(drafts)) as pool:
        futures = [
            pool.submit(
                _concurrent_request,
                barrier,
                "POST",
                f"/api/v1/requests/{draft['id']}/submit",
                json={"version": draft["version"]},
                idempotency_key=str(uuid4()),
            )
            for draft in drafts
        ]
        responses = [future.result() for future in futures]

    assert all(response.status_code == 200 for response in responses)
    sequence_values = sorted(int(response.json()["request_number"].rsplit("-", 1)[1]) for response in responses)
    assert len(set(sequence_values)) == len(drafts)
    assert sequence_values == list(range(sequence_values[0], sequence_values[0] + len(drafts)))


def test_large_request_list_is_bounded_paginated_and_query_efficient(client):
    seed()
    with SessionLocal.begin() as db:
        requestor = db.scalar(select(User).where(User.email == "requestor@payment.local"))
        department_id = db.scalar(select(Department.id).where(Department.code == "MKTG"))
        baseline = db.scalar(
            select(func.count()).select_from(PaymentRequest).where(PaymentRequest.requestor_id == requestor.id)
        )
        records = [
            PaymentRequest(
                request_type="reimbursement",
                requestor_id=requestor.id,
                department_id=department_id,
                payee_name="Pagination Vendor",
                purpose=f"Pagination performance fixture {index:03d}",
                currency_code="PHP",
                gross_amount=Decimal("1.0000"),
                type_data={},
            )
            for index in range(130)
        ]
        db.add_all(records)
        db.flush()
        db.add_all(
            PaymentRequestLine(
                request_id=record.id,
                position=1,
                vendor_name="Pagination Vendor",
                particulars="Performance fixture",
                amount=Decimal("1.0000"),
                currency_code="PHP",
                attachment_refs=[],
            )
            for record in records
        )

    headers = login(client)
    query_count = 0

    def count_query(*_args):
        nonlocal query_count
        query_count += 1

    event.listen(engine, "before_cursor_execute", count_query)
    started_at = perf_counter()
    try:
        first_page = client.get("/api/v1/requests?page=1&page_size=50", headers=headers)
        second_page = client.get("/api/v1/requests?page=2&page_size=50", headers=headers)
    finally:
        elapsed = perf_counter() - started_at
        event.remove(engine, "before_cursor_execute", count_query)

    assert first_page.status_code == 200 and second_page.status_code == 200
    assert len(first_page.json()) == len(second_page.json()) == 50
    assert first_page.headers["X-Total-Count"] == str(baseline + 130)
    assert first_page.headers["X-Page"] == "1" and second_page.headers["X-Page"] == "2"
    assert {item["id"] for item in first_page.json()}.isdisjoint(item["id"] for item in second_page.json())
    # Authentication, permission resolution, pagination metadata, the page,
    # and three batched relationship queries remain constant as rows grow.
    assert query_count <= 24
    assert elapsed < 3.0


def test_request_list_search_filters_sorting_and_amount_bounds(client):
    seed()
    headers = login(client)
    created = []
    for request_type, payee, amount in (
        ("reimbursement", "Alpha Search Merchant", "1250.50"),
        ("general", "Beta Utility Provider", "500.00"),
        ("poPayment", "Gamma Approved Supplier", "2500.00"),
    ):
        request_payload = payload_for_type(request_type)
        request_payload["payee_name"] = payee
        request_payload["lines"][0]["amount"] = amount
        response = client.post("/api/v1/requests", json=request_payload, headers=headers)
        assert response.status_code == 201
        created.append(response.json())

    searched = client.get("/api/v1/requests?search=Alpha%20Search", headers=headers)
    assert searched.status_code == 200
    assert [item["payee_name"] for item in searched.json()] == ["Alpha Search Merchant"]

    filtered = client.get(
        "/api/v1/requests?request_type=poPayment&status=draft&department=MKTG&min_amount=2000&max_amount=3000",
        headers=headers,
    )
    assert filtered.status_code == 200
    assert [item["id"] for item in filtered.json()] == [created[2]["id"]]
    assert filtered.headers["X-Total-Count"] == "1"

    sorted_response = client.get(
        "/api/v1/requests?min_amount=500&sort_by=amount&sort_direction=asc",
        headers=headers,
    )
    amounts = [item["gross_amount"] for item in sorted_response.json() if item["id"] in {row["id"] for row in created}]
    assert amounts == sorted(amounts)
    assert client.get("/api/v1/requests?min_amount=10&max_amount=1", headers=headers).status_code == 422


@pytest.mark.parametrize("currency", ["PHP", "USD", "EUR"])
def test_supported_currency_line_totals_reconcile(currency, client):
    seed()
    headers = login(client)
    request_payload = payload(currency)
    request_payload["lines"][0]["amount"] = "0.0001"
    created = client.post("/api/v1/requests", json=request_payload, headers=headers)
    assert created.status_code == 201
    assert created.json()["currency_code"] == currency
    with SessionLocal() as db:
        assert db.get(PaymentRequest, created.json()["id"]).gross_amount == Decimal("0.0001")


def test_zero_negative_and_maximum_amount_boundaries(client):
    seed()
    headers = login(client)
    zero = payload()
    zero["lines"][0]["amount"] = "0.0000"
    zero_draft = client.post("/api/v1/requests", json=zero, headers=headers)
    assert zero_draft.status_code == 201
    zero_submit = client.post(
        f"/api/v1/requests/{zero_draft.json()['id']}/submit",
        json={"version": zero_draft.json()["version"]},
        headers={**headers, "Idempotency-Key": str(uuid4())},
    )
    assert zero_submit.status_code == 422

    negative = payload()
    negative["lines"][0]["amount"] = "-0.0001"
    assert client.post("/api/v1/requests", json=negative, headers=headers).status_code == 422

    maximum = payload()
    maximum["lines"][0]["amount"] = "999999999999999.9999"
    assert client.post("/api/v1/requests", json=maximum, headers=headers).status_code == 201


def test_manager_scope_explicit_deny_privileged_audit_and_unauthorized_lifecycle(client):
    seed()
    requestor_headers = login(client)
    created = client.post("/api/v1/requests", json=payload(), headers=requestor_headers).json()
    denied_return = client.post(
        f"/api/v1/requests/{created['id']}/return",
        json={"version": created["version"], "note": "Not authorized"},
        headers=requestor_headers,
    )
    assert denied_return.status_code == 403

    with SessionLocal.begin() as db:
        requestor = db.scalar(select(User).where(User.email == "requestor@payment.local"))
        manager = db.scalar(select(User).where(User.email == "department.head@payment.local"))
        operations = db.scalar(select(Department).where(Department.code == "OPS"))
        original_department, original_manager = requestor.department_id, requestor.manager_id
        requestor.department_id = operations.id
        requestor.manager_id = manager.id
        item = db.get(PaymentRequest, created["id"])
        item.department_id = operations.id

    client.cookies.clear()
    manager_headers = login(client, "department.head@payment.local")
    assert client.get(f"/api/v1/requests/{created['id']}", headers=manager_headers).status_code == 200

    client.cookies.clear()
    admin_headers = login(client, "admin@payment.local")
    assert client.get(f"/api/v1/requests/{created['id']}", headers=admin_headers).status_code == 200
    with SessionLocal.begin() as db:
        admin = db.scalar(select(User).where(User.email == "admin@payment.local"))
        read_all = db.scalar(select(Permission).where(Permission.code == "requests.read_all"))
        assert db.scalar(
            select(AuditEvent).where(
                AuditEvent.actor_user_id == admin.id,
                AuditEvent.entity_id == created["id"],
                AuditEvent.action == "payment_request.privileged_read",
            )
        )
        db.add(UserPermissionOverride(user_id=admin.id, permission_id=read_all.id, is_allowed=False))

    assert client.get(f"/api/v1/requests/{created['id']}", headers=admin_headers).status_code == 404

    with SessionLocal.begin() as db:
        requestor = db.scalar(select(User).where(User.email == "requestor@payment.local"))
        requestor.department_id, requestor.manager_id = original_department, original_manager
        db.query(UserPermissionOverride).filter(UserPermissionOverride.user_id == admin.id).delete()
