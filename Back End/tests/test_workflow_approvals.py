from decimal import Decimal
from uuid import uuid4

from payment_module.database import SessionLocal
from payment_module.models import Currency, Department, PaymentRequest, User, WorkflowEvent, WorkflowInstance
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
        start_workflow(db, item, owner.id)
        return item.id


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
    unconfirmed_rejection = client.post(
        f"/api/v1/workflow/{request_id}/reject",
        json={"version": 2, "decision": "return", "note": "Later-stage rule pending"},
        headers={**finance_headers, "Idempotency-Key": "finance-return-pending"},
    )
    assert unconfirmed_rejection.status_code == 409
    next_decision = client.post(
        f"/api/v1/workflow/{request_id}/approve",
        json={"version": 2},
        headers={**finance_headers, "Idempotency-Key": "finance-validation"},
    )
    assert next_decision.status_code == 200 and next_decision.json()["current_stage"] == 2
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


def test_foreign_currency_is_explicitly_pending_without_assignment(client):
    seed()
    request_id = create_submitted(currency="USD")
    login(client, "department.head@payment.local")
    assert client.get("/api/v1/workflow/queue").json() == []
    with SessionLocal() as db:
        instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id))
        assert instance.state == "policy_pending"
        assert instance.current_stage is None
        assert instance.route_snapshot["stages"] == []


def test_pending_request_can_be_activated_after_rate_configuration(client):
    seed()
    with SessionLocal() as db:
        previous_rate = db.get(Currency, "USD").php_per_unit
    try:
        with SessionLocal.begin() as db:
            db.get(Currency, "USD").php_per_unit = None
        request_id = create_submitted(currency="USD", amount="2000", budgeted=True)
        finance_headers = login(client, "finance.manager@payment.local")
        unavailable = client.post(
            f"/api/v1/workflow/{request_id}/activate",
            json={"version": 1},
            headers={**finance_headers, "Idempotency-Key": "activate-unavailable"},
        )
        assert unavailable.status_code == 422
        configured = client.patch("/api/v1/currencies/USD", json={"php_per_unit": "50"}, headers=finance_headers)
        assert configured.status_code == 200
        activated = client.post(
            f"/api/v1/workflow/{request_id}/activate",
            json={"version": 1},
            headers={**finance_headers, "Idempotency-Key": "activate-configured"},
        )
        assert activated.status_code == 200
        assert activated.json()["state"] == "active"
        assert Decimal(activated.json()["route"]["php_amount"]) == Decimal("100000")
        repeated = client.post(
            f"/api/v1/workflow/{request_id}/activate",
            json={"version": 1},
            headers={**finance_headers, "Idempotency-Key": "activate-configured"},
        )
        assert repeated.status_code == 200 and repeated.json() == activated.json()
        with SessionLocal() as db:
            events = db.scalars(
                select(WorkflowEvent).where(
                    WorkflowEvent.request_id == request_id, WorkflowEvent.action == "route_started"
                )
            ).all()
            assert len(events) == 1
    finally:
        with SessionLocal.begin() as db:
            db.get(Currency, "USD").php_per_unit = previous_rate


def test_configured_rate_routes_in_php_and_is_frozen_at_submission(client):
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
            frozen = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id))
            assert frozen.state == "active"
            assert Decimal(frozen.route_snapshot["php_amount"]) == Decimal("1000000.005")
            assert [s["role"] for s in frozen.route_snapshot["stages"][-3:]] == [
                "coo",
                "president",
                "board_member",
            ]

        changed = client.patch("/api/v1/currencies/USD", json={"php_per_unit": "60"}, headers=finance_headers)
        assert changed.status_code == 200
        preview = client.get(f"/api/v1/workflow/preview/{request_id}")
        assert preview.status_code == 200
        assert preview.json()["frozen"] is True
        assert Decimal(preview.json()["php_per_unit"]) == Decimal("50")
        with SessionLocal() as db:
            frozen = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request_id))
            assert Decimal(frozen.route_snapshot["php_per_unit"]) == Decimal("50")
            assert Decimal(frozen.route_snapshot["php_amount"]) == Decimal("1000000.005")
        newer_id = create_submitted(currency="USD", amount="20000.0001", budgeted=False)
        with SessionLocal() as db:
            newer = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == newer_id))
            assert Decimal(newer.route_snapshot["php_per_unit"]) == Decimal("60")
            assert Decimal(newer.route_snapshot["php_amount"]) == Decimal("1200000.006")
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
