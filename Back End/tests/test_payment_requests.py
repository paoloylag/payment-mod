from datetime import UTC, datetime
from uuid import uuid4

from payment_module.database import SessionLocal
from payment_module.models import Department
from payment_module.routers.requests import academic_year_start
from payment_module.seed import seed
from sqlalchemy import select

PASSWORD = "Phase01-Test-Only!"


def login(client, email="requestor@payment.local"):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200
    return {"X-CSRF-Token": response.json()["csrf_token"]}


def payload(currency="PHP"):
    with SessionLocal() as db:
        department_id = db.scalar(select(Department.id).where(Department.code == "MKTG"))
    return {
        "request_type": "reimbursement",
        "department_id": str(department_id),
        "payee_name": "Sample Merchant",
        "purpose": "Phase 03 automated request test",
        "currency_code": currency,
        "type_data": {"source": "test"},
        "lines": [
            {
                "invoice_number": f"INV-{uuid4()}",
                "vendor_name": "Sample Merchant",
                "particulars": "Supplies",
                "amount": "1250.50",
                "currency_code": currency,
            }
        ],
    }


def test_request_crud_optimistic_lock_and_idempotent_submit(client):
    seed()
    headers = login(client)
    created = client.post("/api/v1/requests", json=payload(), headers=headers)
    assert created.status_code == 201
    draft = created.json()
    assert draft["status"] == "draft" and draft["gross_amount"] == 1250.5

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
