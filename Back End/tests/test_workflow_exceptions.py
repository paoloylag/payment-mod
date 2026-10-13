from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from payment_module.database import SessionLocal
from payment_module.models import (
    Department,
    PaymentRequest,
    Permission,
    Role,
    User,
    UserPermissionOverride,
    UserRole,
    WorkflowAssignment,
    WorkflowEvent,
    WorkflowInstance,
)
from payment_module.security import hash_password
from payment_module.seed import seed
from payment_module.workflow_service import start_workflow
from sqlalchemy import delete, select
from test_workflow_approvals import accept_finance_line, create_submitted, login


@pytest.fixture()
def reviewers():
    seed()
    created = []
    with SessionLocal.begin() as db:
        department = db.scalar(select(Department.id).where(Department.code == "MKTG"))
        other_department = db.scalar(select(Department.id).where(Department.code == "FIN"))
        for role, dept in [
            ("department_head", department),
            ("finance_associate", other_department),
            ("department_head", other_department),
        ]:
            user = User(
                email=f"exception-{uuid4()}@payment.local",
                display_name="Test Alternate Reviewer",
                department_id=dept,
                password_hash=hash_password("Phase01-Test-Only!"),
            )
            db.add(user)
            db.flush()
            role_id = db.scalar(select(Role.id).where(Role.code == role))
            db.add(UserRole(user_id=user.id, role_id=role_id))
            created.append((user.id, user.email))
    requests = []
    yield created, requests
    with SessionLocal.begin() as db:
        db.execute(delete(PaymentRequest).where(PaymentRequest.id.in_(requests)))
        db.execute(delete(User).where(User.id.in_([item[0] for item in created])))


def command(client, request_id, headers, **payload):
    return client.post(
        f"/api/v1/workflow/{request_id}/exceptions", json=payload, headers={**headers, "Idempotency-Key": str(uuid4())}
    )


def test_delegation_limits_decisions_and_preserves_original_identity(client, reviewers):
    people, requests = reviewers
    request_id = create_submitted()
    requests.append(request_id)
    headers = login(client, "department.head@payment.local")
    with SessionLocal() as db:
        original_id = db.scalar(select(User.id).where(User.email == "department.head@payment.local"))
    now = datetime.now(UTC)
    payload = dict(
        version=1,
        action="delegate",
        note="Annual leave",
        target_user_id=str(people[0][0]),
        starts_at=(now - timedelta(minutes=1)).isoformat(),
        ends_at=(now + timedelta(days=1)).isoformat(),
    )
    key = str(uuid4())
    response = client.post(
        f"/api/v1/workflow/{request_id}/exceptions", json=payload, headers={**headers, "Idempotency-Key": key}
    )
    assert response.status_code == 200, response.text
    assert response.json()["current_stage"] == 0
    assert (
        client.post(
            f"/api/v1/workflow/{request_id}/exceptions", json=payload, headers={**headers, "Idempotency-Key": key}
        ).json()
        == response.json()
    )
    altered = {**payload, "note": "Changed reason"}
    assert (
        client.post(
            f"/api/v1/workflow/{request_id}/exceptions", json=altered, headers={**headers, "Idempotency-Key": key}
        ).status_code
        == 409
    )
    assert not any(row["request_id"] == str(request_id) for row in client.get("/api/v1/workflow/queue").json())
    assert (
        client.post(
            f"/api/v1/workflow/{request_id}/approve",
            json={"version": 2},
            headers={**headers, "Idempotency-Key": str(uuid4())},
        ).status_code
        == 403
    )
    headers = login(client, people[0][1])
    assert any(row["request_id"] == str(request_id) for row in client.get("/api/v1/workflow/queue").json())
    decision = client.post(
        f"/api/v1/workflow/{request_id}/approve",
        json={"version": 2},
        headers={**headers, "Idempotency-Key": str(uuid4())},
    )
    assert decision.status_code == 200
    with SessionLocal() as db:
        event = db.scalar(
            select(WorkflowEvent).where(
                WorkflowEvent.request_id == request_id, WorkflowEvent.action == "stage_approved"
            )
        )
        assert event.details["assignment"]["assigned_user_id"] == str(original_id)
        assert event.actor_user_id == people[0][0]
        assert event.details["assignment"]["delegation_active"]


def test_scheduled_expired_and_revoked_delegation(client, reviewers):
    people, requests = reviewers
    request_id = create_submitted()
    requests.append(request_id)
    headers = login(client, "department.head@payment.local")
    now = datetime.now(UTC)
    result = command(
        client,
        request_id,
        headers,
        version=1,
        action="delegate",
        note="Planned absence",
        target_user_id=str(people[0][0]),
        starts_at=(now + timedelta(days=1)).isoformat(),
        ends_at=(now + timedelta(days=2)).isoformat(),
    )
    assert result.status_code == 200
    assert any(row["request_id"] == str(request_id) for row in client.get("/api/v1/workflow/queue").json())
    login(client, people[0][1])
    assert not any(row["request_id"] == str(request_id) for row in client.get("/api/v1/workflow/queue").json())
    with SessionLocal.begin() as db:
        assignment = db.scalar(
            select(WorkflowAssignment).join(WorkflowInstance).where(WorkflowInstance.request_id == request_id)
        )
        assignment.delegation_starts_at = now - timedelta(days=2)
        assignment.delegation_ends_at = now - timedelta(days=1)
    assert not any(row["request_id"] == str(request_id) for row in client.get("/api/v1/workflow/queue").json())
    headers = login(client, "department.head@payment.local")
    assert any(row["request_id"] == str(request_id) for row in client.get("/api/v1/workflow/queue").json())
    revoked = command(client, request_id, headers, version=2, action="revoke", note="Coverage no longer required")
    assert revoked.status_code == 200
    assert (
        client.get(f"/api/v1/workflow/{request_id}").json()["current_assignment"]["named"]["delegate_user_id"] is None
    )


def test_reassignment_checks_authority_eligibility_version_and_recovery(client, reviewers):
    people, requests = reviewers
    request_id = create_submitted()
    requests.append(request_id)
    headers = login(client, "finance.manager@payment.local")
    assert (
        command(
            client, request_id, headers, version=1, action="reassign", note="Transfer", target_user_id=str(people[0][0])
        ).status_code
        == 403
    )
    headers = login(client, "admin@payment.local")
    for user_id in (people[1][0], people[2][0]):
        assert (
            command(
                client, request_id, headers, version=1, action="reassign", note="Transfer", target_user_id=str(user_id)
            ).status_code
            == 422
        )
    valid = command(
        client,
        request_id,
        headers,
        version=1,
        action="reassign",
        note="Replace assigned reviewer",
        target_user_id=str(people[0][0]),
    )
    assert valid.status_code == 200, valid.text
    assert (
        command(
            client, request_id, headers, version=1, action="reassign", note="Stale", target_user_id=str(people[0][0])
        ).status_code
        == 409
    )
    assert (
        command(
            client, request_id, headers, version=2, action="recover", note="Not stuck", target_user_id=str(people[0][0])
        ).status_code
        == 409
    )
    with SessionLocal.begin() as db:
        db.get(User, people[0][0]).is_suspended = True
        original_id = db.scalar(select(User.id).where(User.email == "department.head@payment.local"))
    controls = client.get(f"/api/v1/workflow/{request_id}").json()["exception_controls"]
    assert controls["can_recover"]
    recovered = command(
        client,
        request_id,
        headers,
        version=2,
        action="recover",
        note="Assigned reviewer unavailable",
        target_user_id=str(original_id),
    )
    assert recovered.status_code == 200
    assert recovered.json()["current_stage"] == 0
    headers = login(client, "department.head@payment.local")
    assert (
        client.post(
            f"/api/v1/workflow/{request_id}/approve",
            json={"version": 3},
            headers={**headers, "Idempotency-Key": str(uuid4())},
        ).status_code
        == 200
    )


def test_material_correction_restarts_route_and_clears_assignments(client, reviewers):
    people, requests = reviewers
    request_id = create_submitted()
    requests.append(request_id)
    headers = login(client, "department.head@payment.local")
    assert (
        client.post(
            f"/api/v1/workflow/{request_id}/approve",
            json={"version": 1},
            headers={**headers, "Idempotency-Key": str(uuid4())},
        ).status_code
        == 200
    )
    headers = login(client, "finance.manager@payment.local")
    assert (
        command(
            client,
            request_id,
            headers,
            version=2,
            action="reassign",
            note="Finance assignment",
            target_user_id=str(people[1][0]),
        ).status_code
        == 200
    )
    response = command(
        client,
        request_id,
        headers,
        version=3,
        action="material-correction",
        note="Correct the approved amount",
        changed_fields=["amount"],
    )
    assert response.status_code == 200
    assert response.json()["request_status"] == "returned"
    with SessionLocal.begin() as db:
        item = db.get(PaymentRequest, request_id)
        item.status = "submitted"
        item.version += 1
        item.gross_amount = 250000
        instance = start_workflow(db, item, item.requestor_id)
        assert instance.current_stage == 0
        assert instance.route_snapshot["amount"] == "250000"
        assert db.scalar(select(WorkflowAssignment).where(WorkflowAssignment.workflow_id == instance.id)) is None
        assert (
            db.scalar(
                select(WorkflowEvent).where(
                    WorkflowEvent.request_id == request_id, WorkflowEvent.action == "stage_approved"
                )
            )
            is not None
        )


def test_denied_permission_and_self_assignment_are_rejected(client, reviewers):
    people, requests = reviewers
    request_id = create_submitted()
    requests.append(request_id)
    with SessionLocal.begin() as db:
        denied = db.scalar(select(Permission.id).where(Permission.code == "workflow.review"))
        db.add(UserPermissionOverride(user_id=people[0][0], permission_id=denied, is_allowed=False))
        owner = db.scalar(select(User).where(User.email == "requestor@payment.local"))
        owner_id = owner.id
    headers = login(client, "admin@payment.local")
    for target in (people[0][0], owner_id):
        assert (
            command(
                client,
                request_id,
                headers,
                version=1,
                action="reassign",
                note="Invalid assignment",
                target_user_id=str(target),
            ).status_code
            == 422
        )


def test_named_finance_assignment_guards_validation_and_information_response(client, reviewers):
    people, requests = reviewers
    request_id = create_submitted()
    requests.append(request_id)
    head = login(client, "department.head@payment.local")
    assert (
        client.post(
            f"/api/v1/workflow/{request_id}/approve",
            json={"version": 1},
            headers={**head, "Idempotency-Key": str(uuid4())},
        ).status_code
        == 200
    )
    manager = login(client, "finance.manager@payment.local")
    assert (
        command(
            client,
            request_id,
            manager,
            version=2,
            action="reassign",
            note="Finance coverage",
            target_user_id=str(people[1][0]),
        ).status_code
        == 200
    )
    original = login(client, "finance.associate@payment.local")
    validation = client.get(f"/api/v1/finance-validation/{request_id}").json()
    line_id = validation["lines"][0]["line_id"]
    assert (
        client.post(
            f"/api/v1/finance-validation/{request_id}/lines/{line_id}/reviews",
            json={"request_version": validation["request_version"], "decision": "accepted"},
            headers=original,
        ).status_code
        == 403
    )
    alternate = login(client, people[1][1])
    accept_finance_line(client, request_id, alternate)
    assert (
        client.post(
            f"/api/v1/workflow/{request_id}/approve",
            json={"version": 3},
            headers={**alternate, "Idempotency-Key": str(uuid4())},
        ).status_code
        == 200
    )
    manager = login(client, "finance.manager@payment.local")
    assert (
        client.post(
            f"/api/v1/workflow/{request_id}/approve",
            json={"version": 4},
            headers={**manager, "Idempotency-Key": str(uuid4())},
        ).status_code
        == 200
    )
    coo = login(client, "coo@payment.local")
    assert (
        client.post(
            f"/api/v1/workflow/{request_id}/request-information",
            json={"version": 5, "note": "Clarify supporting information"},
            headers={**coo, "Idempotency-Key": str(uuid4())},
        ).status_code
        == 200
    )
    manager = login(client, "finance.manager@payment.local")
    assert (
        command(
            client,
            request_id,
            manager,
            version=6,
            action="reassign",
            note="Assign response",
            target_user_id=str(people[1][0]),
        ).status_code
        == 200
    )
    original = login(client, "finance.associate@payment.local")
    assert (
        client.post(
            f"/api/v1/workflow/{request_id}/respond-information",
            json={"version": 7, "note": "Not assigned"},
            headers={**original, "Idempotency-Key": str(uuid4())},
        ).status_code
        == 403
    )
    alternate = login(client, people[1][1])
    response = client.post(
        f"/api/v1/workflow/{request_id}/respond-information",
        json={"version": 7, "note": "Information supplied"},
        headers={**alternate, "Idempotency-Key": str(uuid4())},
    )
    assert response.status_code == 200
    assert response.json()["current_stage"] == 3
    with SessionLocal() as db:
        assert (
            db.scalar(
                select(WorkflowAssignment)
                .join(WorkflowInstance)
                .where(WorkflowInstance.request_id == request_id, WorkflowAssignment.kind == "response")
            )
            is None
        )


def test_concurrent_reassignment_and_approval_only_one_succeeds(reviewers):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    from fastapi.testclient import TestClient
    from payment_module.main import app

    people, requests = reviewers
    request_id = create_submitted()
    requests.append(request_id)
    gate = Barrier(2)

    def decide(action):
        with TestClient(app) as actor_client:
            headers = login(
                actor_client, "admin@payment.local" if action == "reassign" else "department.head@payment.local"
            )
            gate.wait()
            if action == "reassign":
                result = command(
                    actor_client,
                    request_id,
                    headers,
                    version=1,
                    action="reassign",
                    note="Race check",
                    target_user_id=str(people[0][0]),
                )
            else:
                result = actor_client.post(
                    f"/api/v1/workflow/{request_id}/approve",
                    json={"version": 1},
                    headers={**headers, "Idempotency-Key": str(uuid4())},
                )
            return result.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(decide, ["reassign", "approve"]))
    assert sorted(results) == [200, 409]
    with SessionLocal() as db:
        instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id))
        assert instance.version == 2
