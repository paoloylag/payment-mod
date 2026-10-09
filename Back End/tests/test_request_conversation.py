from decimal import Decimal
from uuid import uuid4

from payment_module.database import SessionLocal
from payment_module.models import Department, PaymentRequest, RequestConversationMessage, User, WorkflowEvent
from payment_module.seed import seed
from payment_module.workflow_service import start_workflow
from sqlalchemy import select


def login(client, email):
    client.cookies.clear()
    response = client.post("/api/v1/auth/login", json={"email": email, "password": "Phase01-Test-Only!"})
    assert response.status_code == 200
    return {"X-CSRF-Token": response.json()["csrf_token"]}


def submitted_request():
    with SessionLocal.begin() as db:
        owner = db.scalar(select(User).where(User.email == "requestor@payment.local"))
        department = db.scalar(select(Department).where(Department.code == "MKTG"))
        item = PaymentRequest(
            id=uuid4(),
            request_type="general",
            status="submitted",
            requestor_id=owner.id,
            department_id=department.id,
            payee_name="Conversation Vendor",
            purpose="Discuss documents",
            currency_code="PHP",
            gross_amount=Decimal("1000000.01"),
            type_data={"budgeted": False},
            version=2,
        )
        db.add(item)
        db.flush()
        start_workflow(db, item, owner.id)
        return item.id


def test_shared_conversation_is_immutable_and_does_not_advance_approval(client):
    seed()
    request_id = submitted_request()
    url = f"/api/v1/requests/{request_id}/conversation"
    owner = login(client, "requestor@payment.local")
    posted = client.post(
        url, json={"body": "  Please check the receipt.  "}, headers={**owner, "Idempotency-Key": "note-1"}
    )
    assert posted.status_code == 201
    assert posted.json()["body"] == "Please check the receipt."
    assert (
        client.post(
            url, json={"body": "Please check the receipt."}, headers={**owner, "Idempotency-Key": "note-1"}
        ).json()
        == posted.json()
    )
    assert client.post(url, json={"body": "Changed"}, headers={**owner, "Idempotency-Key": "note-1"}).status_code == 409
    assert client.post(url, json={"body": "   "}, headers={**owner, "Idempotency-Key": "note-2"}).status_code == 422
    assert client.get(url).json()["items"][0]["body"] == "Please check the receipt."
    with SessionLocal() as db:
        assert (
            len(
                list(
                    db.scalars(
                        select(RequestConversationMessage).where(RequestConversationMessage.request_id == request_id)
                    )
                )
            )
            == 1
        )
        assert not list(
            db.scalars(
                select(WorkflowEvent).where(
                    WorkflowEvent.request_id == request_id, WorkflowEvent.action == "stage_approved"
                )
            )
        )

    head = login(client, "department.head@payment.local")
    assert client.get(url).status_code == 200
    assert (
        client.post(url, json={"body": "I will review it."}, headers={**head, "Idempotency-Key": "head-1"}).status_code
        == 201
    )
    assert len(client.get(url).json()["items"]) == 2
    login(client, "signatory@payment.local")
    assert client.get(url).status_code == 404


def test_information_request_appears_in_conversation_and_declined_is_read_only(client):
    seed()
    request_id = submitted_request()
    url = f"/api/v1/requests/{request_id}/conversation"
    with SessionLocal.begin() as db:
        event = db.scalar(select(WorkflowEvent).where(WorkflowEvent.request_id == request_id))
        db.add(
            WorkflowEvent(
                request_id=request_id,
                workflow_id=event.workflow_id,
                actor_user_id=event.actor_user_id,
                action="information_requested",
                stage_index=3,
                note="Please clarify the amount.",
                details={},
            )
        )
    login(client, "requestor@payment.local")
    result = client.get(url)
    assert result.status_code == 200
    assert any(
        entry["kind"] == "information_requested" and entry["body"] == "Please clarify the amount."
        for entry in result.json()["items"]
    )
    with SessionLocal.begin() as db:
        db.get(PaymentRequest, request_id).status = "declined"
    headers = login(client, "requestor@payment.local")
    assert client.get(url).json()["can_post"] is False
    assert (
        client.post(url, json={"body": "Too late"}, headers={**headers, "Idempotency-Key": "late"}).status_code == 409
    )
