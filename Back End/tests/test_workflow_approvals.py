from decimal import Decimal
from uuid import uuid4

import pytest
from payment_module.database import SessionLocal
from payment_module.models import (
    Currency,
    Department,
    Document,
    DocumentReviewDecision,
    DocumentType,
    DocumentVersion,
    NotificationOutboxEvent,
    PaymentRequest,
    PaymentRequestLine,
    User,
    WorkflowEvent,
    WorkflowInstance,
)
from payment_module.seed import seed
from payment_module.workflow_service import start_workflow
from sqlalchemy import select


def login(client, email):
    client.cookies.clear()
    response = client.post("/api/v1/auth/login", json={"email": email, "password": "Phase01-Test-Only!"})
    assert response.status_code == 200
    return {"X-CSRF-Token": response.json()["csrf_token"]}


def create_submitted(currency="PHP", amount="1000000.01", budgeted=False):
    with SessionLocal.begin() as db:
        owner = db.scalar(select(User).where(User.email == "requestor@payment.local"))
        department = db.scalar(select(Department).where(Department.code == "MKTG"))
        item = PaymentRequest(
            id=uuid4(),
            request_type="general",
            status="submitted",
            requestor_id=owner.id,
            department_id=department.id,
            payee_name="Workflow Vendor",
            purpose="Approval trial",
            currency_code=currency,
            gross_amount=Decimal(amount),
            type_data={"budgeted": budgeted},
            version=2,
        )
        db.add(item)
        db.flush()
        db.add(
            PaymentRequestLine(
                request_id=item.id,
                position=1,
                particulars="Approval trial line",
                amount=Decimal(amount),
                currency_code=currency,
            )
        )
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
        return item.id


def accept_finance_line(client, request_id, headers):
    summary = client.get(f"/api/v1/finance-validation/{request_id}")
    assert summary.status_code == 200, summary.text
    line_id = summary.json()["lines"][0]["line_id"]
    reviewed = client.post(
        f"/api/v1/finance-validation/{request_id}/lines/{line_id}/reviews",
        json={"request_version": summary.json()["request_version"], "decision": "accepted"},
        headers=headers,
    )
    assert reviewed.status_code == 201, reviewed.text


def test_board_route_advances_once_per_stage_and_rejects_wrong_reviewer(client):
    seed()
    request_id = create_submitted()
    owner_headers = login(client, "requestor@payment.local")
    own_attempt = client.post(
        f"/api/v1/workflow/{request_id}/approve",
        json={"version": 1},
        headers={**owner_headers, "Idempotency-Key": "owner-attempt"},
    )
    assert own_attempt.status_code == 403
    own_rejection = client.post(
        f"/api/v1/workflow/{request_id}/reject",
        json={"version": 1, "decision": "decline", "note": "Not my decision"},
        headers={**owner_headers, "Idempotency-Key": "owner-rejection"},
    )
    assert own_rejection.status_code == 403
    head_headers = login(client, "department.head@payment.local")
    blank_reason = client.post(
        f"/api/v1/workflow/{request_id}/reject",
        json={"version": 1, "decision": "return", "note": "   "},
        headers={**head_headers, "Idempotency-Key": "blank-reason"},
    )
    assert blank_reason.status_code == 422
    queue = client.get("/api/v1/workflow/queue").json()
    assert [entry["request_id"] for entry in queue] == [str(request_id)]
    assert queue[0]["request"]["id"] == str(request_id)
    assert [stage["role"] for stage in queue[0]["route"]["stages"][-3:]] == ["coo", "president", "board_member"]
    approval = client.post(
        f"/api/v1/workflow/{request_id}/approve",
        json={"version": 1},
        headers={**head_headers, "Idempotency-Key": "head-approval"},
    )
    assert approval.status_code == 200
    assert approval.json()["current_stage"] == 1
    later_rejection = client.post(
        f"/api/v1/workflow/{request_id}/reject",
        json={"version": 2, "decision": "return", "note": "Too late"},
        headers={**head_headers, "Idempotency-Key": "later-rejection"},
    )
    assert later_rejection.status_code == 403
    repeat = client.post(
        f"/api/v1/workflow/{request_id}/approve",
        json={"version": 1},
        headers={**head_headers, "Idempotency-Key": "head-approval"},
    )
    assert repeat.status_code == 200 and repeat.json() == approval.json()
    stale = client.post(
        f"/api/v1/workflow/{request_id}/approve",
        json={"version": 1},
        headers={**head_headers, "Idempotency-Key": "another-approval"},
    )
    assert stale.status_code == 409
    with SessionLocal() as db:
        assert (
            len(
                db.scalars(
                    select(WorkflowEvent).where(
                        WorkflowEvent.request_id == request_id, WorkflowEvent.action == "stage_approved"
                    )
                ).all()
            )
            == 1
        )

    finance_headers = login(client, "finance.associate@payment.local")
    invalid_destination = client.post(
        f"/api/v1/workflow/{request_id}/reject",
        json={
            "version": 2,
            "decision": "return",
            "return_to_role": "finance_associate",
            "note": "Cannot return to myself",
        },
        headers={**finance_headers, "Idempotency-Key": "finance-return-invalid"},
    )
    assert invalid_destination.status_code == 422
    accept_finance_line(client, request_id, finance_headers)
    next_decision = client.post(
        f"/api/v1/workflow/{request_id}/approve",
        json={"version": 2},
        headers={**finance_headers, "Idempotency-Key": "finance-validation"},
    )
    assert next_decision.status_code == 200, next_decision.text
    assert next_decision.json()["current_stage"] == 2
    assert client.get(f"/api/v1/workflow/{request_id}").status_code == 200
    for version, email in enumerate(
        ("finance.manager@payment.local", "coo@payment.local", "president@payment.local", "board.member@payment.local"),
        start=3,
    ):
        headers = login(client, email)
        decision = client.post(
            f"/api/v1/workflow/{request_id}/approve",
            json={"version": version},
            headers={**headers, "Idempotency-Key": f"approval-{version}"},
        )
        assert decision.status_code == 200
    assert decision.json()["state"] == "approved"
    assert decision.json()["current_stage"] is None


def test_foreign_currency_reaches_finance_manager_without_system_rate(client):
    seed()
    with SessionLocal() as db:
        previous_rate = db.get(Currency, "USD").php_per_unit
    try:
        with SessionLocal.begin() as db:
            db.get(Currency, "USD").php_per_unit = None
        request_id = create_submitted(currency="USD", amount="2000", budgeted=True)
        head_headers = login(client, "department.head@payment.local")
        queue = client.get("/api/v1/workflow/queue").json()
        assert [entry["request_id"] for entry in queue] == [str(request_id)]
        assert queue[0]["route"]["rate_status"] == "awaiting_finance_manager"
        head_approval = client.post(
            f"/api/v1/workflow/{request_id}/approve",
            json={"version": 1},
            headers={**head_headers, "Idempotency-Key": str(uuid4())},
        )
        assert head_approval.status_code == 200
        associate_headers = login(client, "finance.associate@payment.local")
        accept_finance_line(client, request_id, associate_headers)
        associate_approval = client.post(
            f"/api/v1/workflow/{request_id}/approve",
            json={"version": 2},
            headers={**associate_headers, "Idempotency-Key": str(uuid4())},
        )
        assert associate_approval.status_code == 200
        manager_headers = login(client, "finance.manager@payment.local")
        missing_rate = client.post(
            f"/api/v1/workflow/{request_id}/approve",
            json={"version": 3},
            headers={**manager_headers, "Idempotency-Key": str(uuid4())},
        )
        assert missing_rate.status_code == 422
        confirmed = client.post(
            f"/api/v1/workflow/{request_id}/approve",
            json={"version": 3, "php_per_unit": "50", "note": "Rate at Finance review"},
            headers={**manager_headers, "Idempotency-Key": str(uuid4())},
        )
        assert confirmed.status_code == 200
        assert confirmed.json()["state"] == "approved"
        assert Decimal(confirmed.json()["route"]["php_amount"]) == Decimal("100000")
        assert confirmed.json()["route"]["rate_source"] == "request_specific"
    finally:
        with SessionLocal.begin() as db:
            db.get(Currency, "USD").php_per_unit = previous_rate


def test_request_rate_overrides_system_suggestion_and_freezes_remaining_route(client):
    seed()
    requester_headers = login(client, "requestor@payment.local")
    denied = client.patch("/api/v1/currencies/USD", json={"php_per_unit": "50"}, headers=requester_headers)
    assert denied.status_code == 403
    with SessionLocal() as db:
        previous_rate = db.get(Currency, "USD").php_per_unit
    try:
        finance_headers = login(client, "finance.manager@payment.local")
        php_change = client.patch("/api/v1/currencies/PHP", json={"php_per_unit": "2"}, headers=finance_headers)
        assert php_change.status_code == 422
        configured = client.patch("/api/v1/currencies/USD", json={"php_per_unit": "50"}, headers=finance_headers)
        assert configured.status_code == 200
        assert Decimal(configured.json()["php_per_unit"]) == Decimal("50")
        request_id = create_submitted(currency="USD", amount="20000.0001", budgeted=False)
        with SessionLocal() as db:
            initial = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id))
            assert initial.route_snapshot["php_amount"] is None
            assert initial.route_snapshot["suggested_php_per_unit"] == "50.00000000"
            assert len(initial.route_snapshot["stages"]) == 3

        changed = client.patch("/api/v1/currencies/USD", json={"php_per_unit": "60"}, headers=finance_headers)
        assert changed.status_code == 200
        preview = client.get(f"/api/v1/workflow/preview/{request_id}")
        assert preview.status_code == 200
        assert preview.json()["frozen"] is False
        assert preview.json()["php_per_unit"] is None
        for version, email in [(1, "department.head@payment.local"), (2, "finance.associate@payment.local")]:
            headers = login(client, email)
            if version == 2:
                accept_finance_line(client, request_id, headers)
            approval = client.post(
                f"/api/v1/workflow/{request_id}/approve",
                json={"version": version},
                headers={**headers, "Idempotency-Key": str(uuid4())},
            )
            assert approval.status_code == 200
        manager_headers = login(client, "finance.manager@payment.local")
        confirmed = client.post(
            f"/api/v1/workflow/{request_id}/approve",
            json={"version": 3, "php_per_unit": "40", "note": "Processing-date rate"},
            headers={**manager_headers, "Idempotency-Key": str(uuid4())},
        )
        assert confirmed.status_code == 200
        assert confirmed.json()["current_stage"] == 3
        assert [s["role"] for s in confirmed.json()["route"]["stages"][3:]] == ["coo"]
        assert Decimal(confirmed.json()["route"]["php_amount"]) == Decimal("800000.004")
        with SessionLocal() as db:
            frozen = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id))
            assert Decimal(frozen.route_snapshot["php_per_unit"]) == Decimal("40")
            assert (
                len(
                    db.scalars(
                        select(WorkflowEvent).where(
                            WorkflowEvent.request_id == request_id, WorkflowEvent.action == "request_rate_confirmed"
                        )
                    ).all()
                )
                == 1
            )
    finally:
        with SessionLocal.begin() as db:
            db.get(Currency, "USD").php_per_unit = previous_rate


def test_return_and_decline_through_finance_manager_approval(client):
    seed()
    reviewers = [
        (0, "department.head@payment.local"),
        (2, "finance.manager@payment.local"),
        (3, "coo@payment.local"),
        (4, "president@payment.local"),
        (5, "board.member@payment.local"),
    ]
    for index, email in reviewers:
        for decision in ["return", "decline"]:
            request_id = create_submitted()
            with SessionLocal.begin() as db:
                instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id))
                instance.current_stage = index
            wrong_headers = login(client, "requestor@payment.local")
            payload = {"version": 1, "decision": decision, "note": "Please correct the request"}
            denied = client.post(
                f"/api/v1/workflow/{request_id}/reject",
                json=payload,
                headers={**wrong_headers, "Idempotency-Key": str(uuid4())},
            )
            assert denied.status_code == 403
            headers = login(client, email)
            key = str(uuid4())
            response = client.post(
                f"/api/v1/workflow/{request_id}/reject",
                json=payload,
                headers={**headers, "Idempotency-Key": key},
            )
            if index in {0, 2}:
                assert response.status_code == 200, response.text
                assert response.json()["request_status"] == ("returned" if decision == "return" else "declined")
                repeated = client.post(
                    f"/api/v1/workflow/{request_id}/reject",
                    json=payload,
                    headers={**headers, "Idempotency-Key": key},
                )
                assert repeated.json() == response.json()
            else:
                assert response.status_code == 409


def test_executive_information_request_returns_to_same_stage_after_finance_response(client):
    seed()
    request_id = create_submitted()
    for version, email in enumerate(
        ("department.head@payment.local", "finance.associate@payment.local", "finance.manager@payment.local"),
        start=1,
    ):
        headers = login(client, email)
        if version == 2:
            accept_finance_line(client, request_id, headers)
        approval = client.post(
            f"/api/v1/workflow/{request_id}/approve",
            json={"version": version},
            headers={**headers, "Idempotency-Key": f"advance-to-coo-{version}"},
        )
        assert approval.status_code == 200, approval.text
    coo_headers = login(client, "coo@payment.local")
    assert [row["request_id"] for row in client.get("/api/v1/workflow/queue").json()] == [str(request_id)]
    question = client.post(
        f"/api/v1/workflow/{request_id}/request-information",
        json={"version": 4, "note": "Please explain the payee details"},
        headers={**coo_headers, "Idempotency-Key": "coo-question"},
    )
    assert question.status_code == 200, question.text
    assert question.json()["state"] == "information_requested"
    assert question.json()["current_stage"] == 3
    repeated = client.post(
        f"/api/v1/workflow/{request_id}/request-information",
        json={"version": 4, "note": "Please explain the payee details"},
        headers={**coo_headers, "Idempotency-Key": "coo-question"},
    )
    assert repeated.json() == question.json()
    assert client.get("/api/v1/workflow/queue").json() == []
    requestor_headers = login(client, "requestor@payment.local")
    denied = client.post(
        f"/api/v1/workflow/{request_id}/respond-information",
        json={"version": 5, "note": "I am not the Finance Associate"},
        headers={**requestor_headers, "Idempotency-Key": "wrong-responder"},
    )
    assert denied.status_code == 403
    finance_headers = login(client, "finance.associate@payment.local")
    finance_queue = client.get("/api/v1/workflow/queue").json()
    assert [row["request_id"] for row in finance_queue] == [str(request_id)]
    assert finance_queue[0]["assignment_role"] == "finance_associate"
    assert finance_queue[0]["information_request"]["note"] == "Please explain the payee details"
    response = client.post(
        f"/api/v1/workflow/{request_id}/respond-information",
        json={"version": 5, "note": "The payee matches the attached billing document"},
        headers={**finance_headers, "Idempotency-Key": "finance-response"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["state"] == "active"
    assert response.json()["current_stage"] == 3
    assert response.json()["version"] == 6
    assert client.get("/api/v1/workflow/queue").json() == []
    coo_headers = login(client, "coo@payment.local")
    assert [row["request_id"] for row in client.get("/api/v1/workflow/queue").json()] == [str(request_id)]
    detail = client.get(f"/api/v1/workflow/{request_id}").json()
    assert [event["action"] for event in detail["events"]][-2:] == ["information_requested", "information_provided"]
    approval = client.post(
        f"/api/v1/workflow/{request_id}/approve",
        json={"version": 6},
        headers={**coo_headers, "Idempotency-Key": "coo-after-response"},
    )
    assert approval.status_code == 200
    assert approval.json()["current_stage"] == 4


def test_president_and_board_information_requests_resume_their_own_stage(client):
    seed()
    for stage_index, email in [(4, "president@payment.local"), (5, "board.member@payment.local")]:
        request_id = create_submitted()
        with SessionLocal.begin() as db:
            instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id))
            instance.current_stage = stage_index
        reviewer_headers = login(client, email)
        question = client.post(
            f"/api/v1/workflow/{request_id}/request-information",
            json={"version": 1, "note": "Clarify the payment basis"},
            headers={**reviewer_headers, "Idempotency-Key": f"question-{stage_index}"},
        )
        assert question.status_code == 200
        assert question.json()["current_stage"] == stage_index
        finance_headers = login(client, "finance.associate@payment.local")
        response = client.post(
            f"/api/v1/workflow/{request_id}/respond-information",
            json={"version": 2, "note": "The supporting documents explain the basis"},
            headers={**finance_headers, "Idempotency-Key": f"response-{stage_index}"},
        )
        assert response.status_code == 200
        assert response.json()["state"] == "active"
        assert response.json()["current_stage"] == stage_index


def test_finance_manager_return_to_associate_resumes_manager_without_repeating_approvals(client):
    seed()
    request_id = create_submitted()
    head = login(client, "department.head@payment.local")
    denied = client.post(
        f"/api/v1/workflow/{request_id}/reject",
        json={"version": 1, "decision": "return", "return_to_role": "finance_associate", "note": "Check documents"},
        headers={**head, "Idempotency-Key": "head-cannot-skip"},
    )
    assert denied.status_code == 422
    assert (
        client.post(
            f"/api/v1/workflow/{request_id}/approve",
            json={"version": 1},
            headers={**head, "Idempotency-Key": "head-ok"},
        ).status_code
        == 200
    )
    associate = login(client, "finance.associate@payment.local")
    accept_finance_line(client, request_id, associate)
    assert (
        client.post(
            f"/api/v1/workflow/{request_id}/approve",
            json={"version": 2},
            headers={**associate, "Idempotency-Key": "associate-ok"},
        ).status_code
        == 200
    )
    manager = login(client, "finance.manager@payment.local")
    payload = {
        "version": 3,
        "decision": "return",
        "return_to_role": "finance_associate",
        "note": "Please recheck the line",
    }
    returned = client.post(
        f"/api/v1/workflow/{request_id}/reject", json=payload, headers={**manager, "Idempotency-Key": "manager-return"}
    )
    assert returned.status_code == 200, returned.text
    assert returned.json()["state"] == "information_requested"
    assert returned.json()["current_stage"] == 2
    assert returned.json()["return_to_role"] == "finance_associate"
    assert returned.json()["request_status"] == "submitted"
    repeated = client.post(
        f"/api/v1/workflow/{request_id}/reject", json=payload, headers={**manager, "Idempotency-Key": "manager-return"}
    )
    assert repeated.json() == returned.json()
    associate = login(client, "finance.associate@payment.local")
    queue = client.get("/api/v1/workflow/queue").json()
    assert queue[0]["assignment_role"] == "finance_associate"
    assert queue[0]["information_request"]["kind"] == "finance_return"
    response = client.post(
        f"/api/v1/workflow/{request_id}/respond-information",
        json={"version": 4, "note": "Line checked and documents accepted"},
        headers={**associate, "Idempotency-Key": "associate-correction"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["state"] == "active"
    assert response.json()["current_stage"] == 2
    with SessionLocal() as db:
        approved = db.scalars(
            select(WorkflowEvent).where(
                WorkflowEvent.request_id == request_id, WorkflowEvent.action == "stage_approved"
            )
        ).all()
        assert sorted(event.stage_index for event in approved) == [0, 1]
    manager = login(client, "finance.manager@payment.local")
    approval = client.post(
        f"/api/v1/workflow/{request_id}/approve",
        json={"version": 5},
        headers={**manager, "Idempotency-Key": "manager-after-correction"},
    )
    assert approval.status_code == 200, approval.text
    assert approval.json()["current_stage"] == 3


def test_finance_manager_return_to_requestor_resubmits_at_associate(client):
    seed()
    request_id = create_submitted()
    head = login(client, "department.head@payment.local")
    assert client.post(
        f"/api/v1/workflow/{request_id}/approve",
        json={"version": 1}, headers={**head, "Idempotency-Key": "head-before-manager-return"},
    ).status_code == 200
    associate = login(client, "finance.associate@payment.local")
    accept_finance_line(client, request_id, associate)
    assert client.post(
        f"/api/v1/workflow/{request_id}/approve",
        json={"version": 2}, headers={**associate, "Idempotency-Key": "associate-before-manager-return"},
    ).status_code == 200
    manager = login(client, "finance.manager@payment.local")
    returned = client.post(
        f"/api/v1/workflow/{request_id}/reject",
        json={"version": 3, "decision": "return", "return_to_role": "requestor", "note": "Correct the breakdown"},
        headers={**manager, "Idempotency-Key": "manager-return-to-owner"},
    )
    assert returned.status_code == 200, returned.text
    with SessionLocal.begin() as db:
        item = db.get(PaymentRequest, request_id)
        item.status = "submitted"
        item.version += 1
        assert start_workflow(db, item, item.requestor_id).current_stage == 1


def test_finance_associate_return_to_requestor_resubmits_at_associate(client):
    seed()
    request_id = create_submitted()
    head = login(client, "department.head@payment.local")
    assert (
        client.post(
            f"/api/v1/workflow/{request_id}/approve",
            json={"version": 1},
            headers={**head, "Idempotency-Key": "head-before-return"},
        ).status_code
        == 200
    )
    associate = login(client, "finance.associate@payment.local")
    summary = client.get(f"/api/v1/finance-validation/{request_id}").json()
    flagged = client.post(
        f"/api/v1/finance-validation/{request_id}/lines/{summary['lines'][0]['line_id']}/reviews",
        json={"request_version": summary["request_version"], "decision": "flagged", "reason": "Receipt amount differs"},
        headers=associate,
    )
    assert flagged.status_code == 201
    returned = client.post(
        f"/api/v1/workflow/{request_id}/reject",
        json={"version": 2, "decision": "return", "return_to_role": "requestor", "note": "Please replace the receipt"},
        headers={**associate, "Idempotency-Key": "associate-return"},
    )
    assert returned.status_code == 200, returned.text
    assert returned.json()["request_status"] == "returned"
    requester = login(client, "requestor@payment.local")
    detail = client.get(f"/api/v1/workflow/{request_id}", headers=requester).json()
    targets = detail["events"][-1]["correction_targets"]
    assert targets["lines"] == [
        {
            "line_id": summary["lines"][0]["line_id"],
            "position": 1,
            "particulars": "Approval trial line",
            "decision": "flagged",
            "reason": "Receipt amount differs",
        }
    ]
    with SessionLocal.begin() as db:
        item = db.get(PaymentRequest, request_id)
        item.status = "submitted"
        item.version += 1
        resumed = start_workflow(db, item, item.requestor_id)
        assert resumed.current_stage == 1
    with SessionLocal() as db:
        approved = db.scalars(
            select(WorkflowEvent).where(
                WorkflowEvent.request_id == request_id, WorkflowEvent.action == "stage_approved"
            )
        ).all()
        assert [event.stage_index for event in approved] == [0]


def test_assignment_queue_filters_pagination_and_named_history(client):
    seed()
    lower = create_submitted(amount="1000", budgeted=True)
    higher = create_submitted(amount="2000", budgeted=True)
    head = login(client, "department.head@payment.local")
    queue_url = "/api/v1/workflow/queue"
    assert {row["request_id"] for row in client.get(queue_url).json()} == {str(lower), str(higher)}
    filtered = client.get(queue_url, params={"assignment_role": "department_head", "min_php_amount": "1500"})
    assert [row["request_id"] for row in filtered.json()] == [str(higher)]
    paged = client.get(queue_url, params={"sort_by": "php_amount", "descending": "true", "limit": 1})
    assert [row["request_id"] for row in paged.json()] == [str(higher)]
    next_page = client.get(queue_url, params={"sort_by": "php_amount", "descending": "true", "offset": 1, "limit": 1})
    assert [row["request_id"] for row in next_page.json()] == [str(lower)]
    assert client.get(queue_url, params={"min_php_amount": "3000", "max_php_amount": "1000"}).status_code == 422
    assert (
        client.post(
            f"/api/v1/workflow/{lower}/approve",
            json={"version": 1},
            headers={**head, "Idempotency-Key": "queue-head-approval"},
        ).status_code
        == 200
    )
    assert [row["request_id"] for row in client.get(queue_url).json()] == [str(higher)]
    login(client, "finance.associate@payment.local")
    assert [
        row["request_id"] for row in client.get(queue_url, params={"assignment_role": "finance_associate"}).json()
    ] == [str(lower)]
    detail = client.get(f"/api/v1/workflow/{lower}")
    assert detail.status_code == 200
    assert detail.json()["current_assignment"]["role"] == "finance_associate"
    assert detail.json()["events"][-1]["actor_name"]


def test_workflow_outbox_tracks_committed_events_once(client):
    seed()
    request_id = create_submitted(amount="1000", budgeted=True)
    head = login(client, "department.head@payment.local")
    headers = {**head, "Idempotency-Key": "outbox-head-approval"}
    approved = client.post(f"/api/v1/workflow/{request_id}/approve", json={"version": 1}, headers=headers)
    assert approved.status_code == 200
    assert (
        client.post(f"/api/v1/workflow/{request_id}/approve", json={"version": 1}, headers=headers).json()
        == approved.json()
    )
    assert (
        client.post(
            f"/api/v1/workflow/{request_id}/approve",
            json={"version": 1},
            headers={**head, "Idempotency-Key": "outbox-stale-attempt"},
        ).status_code
        == 409
    )
    with SessionLocal() as db:
        events = db.scalars(select(WorkflowEvent).where(WorkflowEvent.request_id == request_id)).all()
        outbox = db.scalars(
            select(NotificationOutboxEvent).where(NotificationOutboxEvent.aggregate_id == request_id)
        ).all()
        assert {row.source_event_id for row in outbox} == {event.id for event in events}
        assert {row.event_type for row in outbox} == {"workflow.route_started", "workflow.stage_approved"}
        assert all(row.state == "pending" and row.payload["request_id"] == str(request_id) for row in outbox)


@pytest.mark.parametrize(
    "stage,email",
    [
        (0, "department.head@payment.local"),
        (1, "finance.associate@payment.local"),
        (2, "finance.manager@payment.local"),
        (3, "coo@payment.local"),
        (4, "president@payment.local"),
        (5, "board.member@payment.local"),
    ],
)
@pytest.mark.parametrize("decision", ["return", "decline"])
def test_decision_availability_at_every_stage(client, stage, email, decision):
    seed()
    request_id = create_submitted()
    with SessionLocal.begin() as db:
        workflow = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id))
        workflow.current_stage = stage
    headers = login(client, email)
    result = client.post(
        f"/api/v1/workflow/{request_id}/reject",
        json={"version": 1, "decision": decision, "note": "Stage decision verification"},
        headers={**headers, "Idempotency-Key": str(uuid4())},
    )
    if stage > 2:
        assert result.status_code == 409, result.text
    else:
        assert result.status_code == 200, result.text
        with SessionLocal() as db:
            item = db.get(PaymentRequest, request_id)
            assert item.status == ("returned" if decision == "return" else "declined")


def test_finance_manager_approval_on_behalf_preserves_stages_and_gates(client):
    seed()
    request_id = create_submitted()
    headers = login(client, "finance.manager@payment.local")
    url = f"/api/v1/workflow/{request_id}"
    def approve(version, key, **extra):
        return client.post(url + "/approve", json={"version": version, "note": "Approver on leave", "on_behalf": True, **extra}, headers={**headers, "Idempotency-Key": key})
    assert client.get(url).json()["can_approve_on_behalf"]
    assert approve(1, "blank", note="  ").status_code == 422
    response = approve(1, "head-coverage")
    assert response.status_code == 200, response.text
    assert response.json()["current_stage"] == 1
    assert approve(1, "head-coverage").json() == response.json()
    assert approve(2, "head-coverage").status_code == 409
    assert approve(1, "stale-coverage").status_code == 409
    assert approve(2, "unvalidated-coverage").status_code == 409
    fa_headers = login(client, "finance.associate@payment.local")
    accept_finance_line(client, request_id, fa_headers)
    headers = login(client, "finance.manager@payment.local")
    assert approve(2, "finance-coverage").status_code == 200
    assert not client.get(url).json()["can_approve_on_behalf"]
    assert approve(3, "own-stage-coverage").status_code == 403
    normal = client.post(url + "/approve", json={"version": 3}, headers={**headers, "Idempotency-Key": "normal-manager"})
    assert normal.status_code == 200, normal.text
    for version, stage_index, name in [(4, 4, "coo"), (5, 5, "president"), (6, None, "board")]:
        result = approve(version, name + "-coverage")
        assert result.status_code == 200, result.text
        assert result.json()["current_stage"] == stage_index
    assert approve(7, "already-complete").status_code == 409
    events = client.get(url).json()["events"]
    covered = [e for e in events if e["details"].get("approved_on_behalf")]
    assert [e["details"]["on_behalf_role"] for e in covered] == ["department_head", "finance_associate", "coo", "president", "board_member"]
    assert all(e["note"] == "Approver on leave" for e in covered)


@pytest.mark.parametrize("email", ["requestor@payment.local", "department.head@payment.local", "finance.associate@payment.local", "coo@payment.local", "admin@payment.local"])
def test_other_roles_cannot_approve_on_behalf(client, email):
    seed()
    request_id = create_submitted()
    headers = login(client, email)
    response = client.post(f"/api/v1/workflow/{request_id}/approve", json={"version": 1, "on_behalf": True, "note": "Unavailable"}, headers={**headers, "Idempotency-Key": str(uuid4())})
    assert response.status_code == 403


def test_manager_cannot_override_own_request_or_paused_information(client):
    seed()
    request_id = create_submitted()
    headers = login(client, "finance.manager@payment.local")
    with SessionLocal.begin() as db:
        manager = db.scalar(select(User).where(User.email == "finance.manager@payment.local"))
        item = db.get(PaymentRequest, request_id)
        original_owner = item.requestor_id
        item.requestor_id = manager.id
    url = f"/api/v1/workflow/{request_id}"
    payload = {"version": 1, "on_behalf": True, "note": "Approver unavailable"}
    assert client.post(url + "/approve", json=payload, headers={**headers, "Idempotency-Key": "self-coverage"}).status_code == 403
    with SessionLocal.begin() as db:
        db.get(PaymentRequest, request_id).requestor_id = original_owner
        instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id))
        instance.state = "information_requested"
    assert not client.get(url).json()["can_approve_on_behalf"]
    assert client.post(url + "/approve", json=payload, headers={**headers, "Idempotency-Key": "paused-coverage"}).status_code == 409
