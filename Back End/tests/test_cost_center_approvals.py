from uuid import uuid4
import pytest
from fastapi import HTTPException
from sqlalchemy import select
from payment_module.database import SessionLocal
from payment_module.models import CostCenter, Department, User, WorkflowInstance, PaymentRequest
from payment_module.cost_center_approvals import routing_approver
from payment_module.notification_policy import reviewers
from payment_module.seed import seed
from test_workflow_approvals import create_submitted, login


def test_cost_center_assignee_controls_queue_visibility_chat_and_notifications(client):
    seed()
    headers = login(client, "admin@payment.local")
    roles = client.get("/api/v1/roles").json()
    departments = client.get("/api/v1/departments").json()
    head_role = next(r["id"] for r in roles if r["code"] == "department_head")
    other_department = next(d["id"] for d in departments if d["code"] == "OPS")
    email = f"cross-center-{uuid4()}@payment.local"
    created = client.post("/api/v1/users", json={"email": email, "display_name": "Cross Department Approver", "password": "Phase01-Test-Only!", "department_id": other_department, "role_ids": [head_role]}, headers=headers)
    assert created.status_code == 201, created.text
    assigned_id = created.json()["id"]
    center = next(c for c in client.get("/api/v1/cost-centers").json() if c["code"] == "MKTG")
    url = f"/api/v1/cost-centers/{center['id']}/approver"
    original_id = center["approver_user_id"]
    try:
        changed = client.patch(url, json={"approver_user_id": assigned_id}, headers=headers)
        assert changed.status_code == 200, changed.text
        request_id = create_submitted()
        login(client, "department.head@payment.local")
        assert str(request_id) not in [r["request_id"] for r in client.get("/api/v1/workflow/queue").json()]
        assert client.get(f"/api/v1/requests/{request_id}").status_code == 404
        assert client.get(f"/api/v1/requests/{request_id}/conversation").status_code == 404
        assigned_headers = login(client, email)
        assert str(request_id) in [r["request_id"] for r in client.get("/api/v1/workflow/queue").json()]
        assert client.get(f"/api/v1/requests/{request_id}").status_code == 200
        people = client.get(f"/api/v1/requests/{request_id}/conversation").json()["participants"]
        assert assigned_id in [p["id"] for p in people]
        with SessionLocal() as db:
            item = db.get(PaymentRequest, request_id)
            instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id))
            assert {str(uid) for uid in reviewers(db, item, instance, "department_head", current=True)} == {assigned_id}
        headers = login(client, "admin@payment.local")
        assert client.patch(url, json={"approver_user_id": original_id}, headers=headers).status_code == 200
        login(client, email)
        assert client.get(f"/api/v1/workflow/{request_id}").json()["route"]["department_approver_id"] == assigned_id
        response = client.post(f"/api/v1/workflow/{request_id}/approve", json={"version": 1}, headers={**login(client, email), "Idempotency-Key": str(uuid4())})
        assert response.status_code == 200, response.text
    finally:
        headers = login(client, "admin@payment.local")
        client.patch(url, json={"approver_user_id": original_id}, headers=headers)


def test_missing_ineligible_and_unauthorized_cost_center_configuration(client):
    seed()
    headers = login(client, "admin@payment.local")
    center = next(c for c in client.get("/api/v1/cost-centers").json() if c["code"] == "MKTG")
    original_id = center["approver_user_id"]
    url = f"/api/v1/cost-centers/{center['id']}/approver"
    owner = next(u for u in client.get("/api/v1/users").json() if u["email"] == "requestor@payment.local")
    assert client.patch(url, json={"approver_user_id": owner["id"]}, headers=headers).status_code == 422
    assert client.patch(url, json={"approver_user_id": str(uuid4())}, headers=headers).status_code == 422
    request_id = create_submitted()
    try:
        assert client.patch(url, json={"approver_user_id": None}, headers=headers).status_code == 200
        with SessionLocal() as db:
            with pytest.raises(HTTPException) as error:
                routing_approver(db, db.get(PaymentRequest, request_id), required=True)
            assert error.value.status_code == 422
        requestor = login(client, "requestor@payment.local")
        assert client.patch(url, json={"approver_user_id": original_id}, headers=requestor).status_code == 403
    finally:
        headers = login(client, "admin@payment.local")
        client.patch(url, json={"approver_user_id": original_id}, headers=headers)
