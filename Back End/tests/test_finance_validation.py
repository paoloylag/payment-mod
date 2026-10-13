from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from payment_module.database import SessionLocal
from payment_module.models import (
    Department,
    Document,
    DocumentReviewDecision,
    DocumentType,
    DocumentVersion,
    PaymentRequest,
    PaymentRequestLine,
    User,
)
from payment_module.seed import seed
from payment_module.workflow_service import start_workflow
from sqlalchemy import select


def login(client, email):
    client.cookies.clear()
    response = client.post("/api/v1/auth/login", json={"email": email, "password": "Phase01-Test-Only!"})
    assert response.status_code == 200
    return {"X-CSRF-Token": response.json()["csrf_token"]}


def submitted_request(request_type="general", billing_ready=True):
    with SessionLocal.begin() as db:
        owner = db.scalar(select(User).where(User.email == "requestor@payment.local"))
        department = db.scalar(select(Department).where(Department.code == "MKTG"))
        item = PaymentRequest(
            id=uuid4(),
            request_type=request_type,
            status="submitted",
            requestor_id=owner.id,
            department_id=department.id,
            payee_name="Finance Review Vendor",
            purpose="Validation test",
            currency_code="PHP",
            gross_amount=Decimal("1000"),
            type_data={"budgeted": True},
            version=2,
        )
        db.add(item)
        db.flush()
        line = PaymentRequestLine(
            request_id=item.id, position=1, particulars="Invoice line", amount=Decimal("1000"), currency_code="PHP"
        )
        db.add(line)
        if request_type == "general" and billing_ready:
            billing_type = db.scalar(select(DocumentType).where(DocumentType.code == "BILLING_SOA"))
            document = Document(request_id=item.id, owner_user_id=owner.id, document_type_id=billing_type.id)
            db.add(document)
            db.flush()
            db.add(
                DocumentVersion(
                    document_id=document.id,
                    version=1,
                    original_filename="billing.pdf",
                    media_type="application/pdf",
                    byte_size=100,
                    sha256="a" * 64,
                    bucket="test",
                    object_key=f"test/{uuid4()}",
                    uploaded_by_user_id=owner.id,
                )
            )
            db.flush()
            db.add(DocumentReviewDecision(document_id=document.id, decision="accepted", actor_user_id=owner.id))
        start_workflow(db, item, owner.id)
        return item.id, line.id


def advance_to_finance(client, request_id):
    head = login(client, "department.head@payment.local")
    response = client.post(
        f"/api/v1/workflow/{request_id}/approve",
        json={"version": 1},
        headers={**head, "Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 200


def test_line_reviews_are_persistent_and_gate_finance_approval(client):
    seed()
    request_id, line_id = submitted_request()
    advance_to_finance(client, request_id)
    associate = login(client, "finance.associate@payment.local")
    url = f"/api/v1/finance-validation/{request_id}"
    summary = client.get(url).json()
    assert summary["ready_to_approve"] is False
    assert summary["lines"][0]["decision"] == "pending"
    assert any(not check["complete"] for check in summary["checks"])
    blocked = client.post(
        f"/api/v1/workflow/{request_id}/approve",
        json={"version": 2},
        headers={**associate, "Idempotency-Key": str(uuid4())},
    )
    assert blocked.status_code == 409
    review_url = f"{url}/lines/{line_id}/reviews"
    assert (
        client.post(review_url, json={"request_version": 2, "decision": "flagged"}, headers=associate).status_code
        == 422
    )
    flagged = client.post(
        review_url, json={"request_version": 2, "decision": "flagged", "reason": "Unreadable line"}, headers=associate
    )
    assert flagged.status_code == 201
    assert flagged.json()["lines"][0]["decision"] == "flagged"
    assert flagged.json()["ready_to_approve"] is False
    accepted = client.post(review_url, json={"request_version": 2, "decision": "accepted"}, headers=associate)
    assert accepted.status_code == 201
    assert accepted.json()["ready_to_approve"] is True
    assert all(check["complete"] for check in accepted.json()["checks"])
    approved = client.post(
        f"/api/v1/workflow/{request_id}/approve",
        json={"version": 2},
        headers={**associate, "Idempotency-Key": str(uuid4())},
    )
    assert approved.status_code == 200
    assert approved.json()["current_stage"] == 2


def test_reimbursement_line_requires_physical_original(client):
    seed()
    request_id, line_id = submitted_request("reimbursement")
    advance_to_finance(client, request_id)
    associate = login(client, "finance.associate@payment.local")
    review_url = f"/api/v1/finance-validation/{request_id}/lines/{line_id}/reviews"
    first = client.post(review_url, json={"request_version": 2, "decision": "accepted"}, headers=associate)
    assert first.status_code == 201
    assert any("physical original" in blocker for blocker in first.json()["blockers"])
    received = client.post(
        review_url,
        json={"request_version": 2, "decision": "accepted", "physical_original_received": True},
        headers=associate,
    )
    assert received.status_code == 201
    assert received.json()["lines"][0]["physical_original_received"] is True
    assert any("proof of payment" in blocker for blocker in received.json()["blockers"])


def test_only_current_finance_associate_can_review_lines(client):
    seed()
    request_id, line_id = submitted_request()
    requester = login(client, "requestor@payment.local")
    review_url = f"/api/v1/finance-validation/{request_id}/lines/{line_id}/reviews"
    assert client.post(
        review_url, json={"request_version": 2, "decision": "accepted"}, headers=requester
    ).status_code in {403, 409}
    advance_to_finance(client, request_id)
    manager = login(client, "finance.manager@payment.local")
    assert (
        client.post(review_url, json={"request_version": 2, "decision": "accepted"}, headers=manager).status_code == 403
    )


def test_replacing_an_accepted_document_requires_a_fresh_review(client):
    seed()
    request_id, line_id = submitted_request(billing_ready=False)
    with SessionLocal.begin() as db:
        owner = db.get(PaymentRequest, request_id).requestor_id
        billing_type = db.scalar(select(DocumentType).where(DocumentType.code == "BILLING_SOA"))
        document = Document(request_id=request_id, owner_user_id=owner, document_type_id=billing_type.id)
        db.add(document)
        db.flush()
        first_version = DocumentVersion(
            document_id=document.id,
            version=1,
            original_filename="invoice.pdf",
            media_type="application/pdf",
            byte_size=100,
            sha256="a" * 64,
            bucket="test",
            object_key=f"test/{uuid4()}",
            uploaded_by_user_id=owner,
        )
        db.add(first_version)
        db.flush()
        document_id = document.id
    advance_to_finance(client, request_id)
    associate = login(client, "finance.associate@payment.local")
    summary = client.post(
        f"/api/v1/finance-validation/{request_id}/lines/{line_id}/reviews",
        json={"request_version": 2, "decision": "accepted"},
        headers=associate,
    )
    assert any("invoice.pdf" in blocker for blocker in summary.json()["blockers"])
    reviewed = client.post(
        f"/api/v1/documents/{document_id}/reviews",
        json={"decision": "accepted"},
        headers=associate,
    )
    assert reviewed.status_code == 201
    assert client.get(f"/api/v1/finance-validation/{request_id}").json()["ready_to_approve"] is True
    with SessionLocal.begin() as db:
        document = db.get(Document, document_id)
        first_version = db.scalar(
            select(DocumentVersion).where(DocumentVersion.document_id == document_id, DocumentVersion.version == 1)
        )
        first_version.is_current = False
        db.flush()
        document.current_version = 2
        db.add(
            DocumentVersion(
                document_id=document_id,
                version=2,
                original_filename="replacement.pdf",
                media_type="application/pdf",
                byte_size=100,
                sha256="b" * 64,
                bucket="test",
                object_key=f"test/{uuid4()}",
                uploaded_by_user_id=owner,
                created_at=datetime.now(UTC) + timedelta(seconds=1),
            )
        )
    changed = client.get(f"/api/v1/finance-validation/{request_id}").json()
    assert changed["ready_to_approve"] is False
    assert changed["documents"][0]["decision"] == "pending"
