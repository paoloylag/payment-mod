from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

from payment_module.database import SessionLocal
from payment_module.models import Department, PaymentRequest, User
from payment_module.seed import seed
from sqlalchemy import select
from test_workflow_approvals import login


def records(count=125):
    seed()
    token = "report-" + uuid4().hex
    with SessionLocal.begin() as db:
        owner = db.scalar(select(User).where(User.email == "requestor@payment.local"))
        other = db.scalar(select(User).where(User.email == "finance.associate@payment.local"))
        department = db.scalar(select(Department).where(Department.code == "MKTG"))
        for index in range(count):
            db.add(
                PaymentRequest(
                    request_type="general",
                    status="submitted",
                    requestor_id=owner.id,
                    department_id=department.id,
                    purpose=token,
                    payee_name="=UNSAFE()" if index == 0 else "Vendor",
                    currency_code="USD" if index % 2 else "PHP",
                    gross_amount=Decimal("100.1250"),
                    submitted_at=datetime(2026, 10, 19, 16, 0, tzinfo=UTC),
                )
            )
        db.add(
            PaymentRequest(
                request_type="general",
                status="submitted",
                requestor_id=other.id,
                department_id=department.id,
                purpose=token,
                payee_name="Other user",
                currency_code="PHP",
                gross_amount=Decimal("1.0000"),
                submitted_at=datetime(2026, 10, 19, 15, 59, tzinfo=UTC),
            )
        )
        db.add(
            PaymentRequest(
                request_type="general",
                status="draft",
                requestor_id=owner.id,
                department_id=department.id,
                purpose=token,
                currency_code="PHP",
                gross_amount=Decimal("9999"),
            )
        )
    return token


def test_report_reconciles_all_rows_not_first_page_and_separates_currency(client):
    token = records()
    login(client, "requestor@payment.local")
    data = client.get("/api/v1/reports/requests", params={"search": token}).json()
    assert data["total"] == 125 and len(data["items"]) == 20
    assert data["summary"]["currency_totals"] == {"PHP": "6307.8750", "USD": "6207.7500"}
    assert sum(data["summary"]["status_counts"].values()) == 125
    second = client.get("/api/v1/reports/requests", params={"search": token, "page": 2}).json()
    assert not {row["request_id"] for row in data["items"]} & {row["request_id"] for row in second["items"]}
    full = client.get("/api/v1/reports/requests", params={"search": token, "export": True}).json()
    assert len(full["items"]) == 125 and full["summary"] == data["summary"]
    assert any(row["payee"] == "=UNSAFE()" for row in full["items"])
    assert all(row["submitted"] == "2026-10-20" for row in full["items"])
    login(client, "finance.manager@payment.local")
    admin = client.get("/api/v1/reports/requests", params={"search": token, "export": True}).json()
    assert admin["total"] == 126
    login(client, "coo@payment.local")
    hidden = client.get("/api/v1/reports/requests", params={"search": token}).json()
    assert hidden["total"] == 0 and hidden["summary"]["currency_totals"] == {}


def test_report_date_filters_limits_and_literal_search(client, monkeypatch):
    token = records(3)
    login(client, "finance.manager@payment.local")
    data = client.get(
        "/api/v1/reports/requests",
        params={"search": token, "date_from": "2026-10-20", "date_to": "2026-10-20", "export": True},
    ).json()
    assert data["total"] == 3
    assert all(row["payee"] != "Other user" for row in data["items"])
    for filters in [{"min_amount": "10", "max_amount": "1"}, {"date_from": "2026-10-20", "date_to": "2026-10-19"}]:
        assert client.get("/api/v1/reports/requests", params=filters).status_code == 422
    assert client.get("/api/v1/reports/requests", params={"search": "%"}).json()["total"] == 0
    import payment_module.routers.reports as reports

    monkeypatch.setattr(reports, "LIMIT", 2)
    response = client.get("/api/v1/reports/requests", params={"search": token, "export": True})
    assert response.status_code == 413
    assert "Narrow" in response.text


def test_display_status_filter_matches_list_without_lifecycle_ambiguity(client):
    from test_workflow_approvals import create_submitted

    seed()
    request_id = create_submitted()
    with SessionLocal.begin() as db:
        item = db.get(PaymentRequest, request_id)
        item.purpose = "status-filter-" + uuid4().hex
        item.submitted_at = datetime.now(UTC)
        token = item.purpose
    login(client, "finance.manager@payment.local")
    listed = client.get("/api/v1/requests", params={"search": token}).json()[0]
    assert listed["display_status"] == "Department Approval"
    matching = client.get(
        "/api/v1/reports/requests", params={"search": token, "status": listed["display_status"]}
    ).json()
    assert matching["total"] == 1 and matching["items"][0]["status"] == listed["display_status"]
    assert client.get("/api/v1/reports/requests", params={"search": token, "status": "Submitted"}).json()["total"] == 0
    assert (
        client.get(
            "/api/v1/reports/requests",
            params={"search": token, "lifecycle_status": "submitted", "date_to": "9999-12-31"},
        ).json()["total"]
        == 1
    )
