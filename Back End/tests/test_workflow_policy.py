from decimal import Decimal
from uuid import uuid4

import pytest
from payment_module.database import SessionLocal
from payment_module.models import Department, PaymentRequest, User
from payment_module.seed import seed
from payment_module.workflow_policy import POLICY_VERSION, PolicyCannotRoute, route_for
from sqlalchemy import select


@pytest.mark.parametrize(
    ("request_type", "budgeted", "amount", "expected"),
    [
        ("cashAdvance", True, "40000", "finance_manager"),
        ("reimbursement", True, "99999.99", "finance_manager"),
        ("reimbursement", True, "100000", "finance_manager"),
        ("reimbursement", True, "100000.01", "coo"),
        ("general", True, "300000", "coo"),
        ("general", True, "300000.01", "president"),
        ("poPayment", False, "1000000", "coo"),
        ("poPayment", False, "1000000.01", "board_member"),
        ("liquidation", True, "25000", "finance_manager"),
    ],
)
def test_prototype_threshold_boundaries(request_type, budgeted, amount, expected):
    route = route_for(request_type=request_type, budgeted=budgeted, amount=Decimal(amount), currency_code="PHP")
    assert route.policy_version == POLICY_VERSION
    assert [stage.role for stage in route.stages[:2]] == ["department_head", "finance_associate"]
    assert route.stages[-1].role == expected
    assert [stage.code for stage in route.stages].count("budget_review") <= 1


@pytest.mark.parametrize(
    ("request_type", "amount", "currency"),
    [
        ("cashAdvance", "40000.01", "PHP"),
        ("general", "0", "PHP"),
        ("general", "100", "USD"),
        ("general", "100", "EUR"),
        ("unknown", "100", "PHP"),
    ],
)
def test_unroutable_requests_fail_explicitly(request_type, amount, currency):
    with pytest.raises(PolicyCannotRoute):
        route_for(
            request_type=request_type,
            budgeted=True,
            amount=Decimal(amount),
            currency_code=currency,
        )


def test_route_preview_is_visible_only_to_authorized_request_users(client):
    seed()
    with SessionLocal.begin() as db:
        owner = db.scalar(select(User).where(User.email == "requestor@payment.local"))
        department = db.scalar(select(Department).where(Department.code == "MKTG"))
        item = PaymentRequest(
            id=uuid4(),
            request_type="general",
            requestor_id=owner.id,
            department_id=department.id,
            payee_name="Preview Vendor",
            purpose="Phase 05 route preview",
            currency_code="PHP",
            gross_amount=Decimal("300000.01"),
            type_data={"budgeted": True},
        )
        db.add(item)
        request_id = item.id
        pending_board = PaymentRequest(
            id=uuid4(),
            request_type="general",
            requestor_id=owner.id,
            department_id=department.id,
            payee_name="Preview Vendor",
            purpose="Pending Board sequence",
            currency_code="PHP",
            gross_amount=Decimal("1000000.01"),
            type_data={"budgeted": False},
        )
        pending_currency = PaymentRequest(
            id=uuid4(),
            request_type="general",
            requestor_id=owner.id,
            department_id=department.id,
            payee_name="Preview Vendor",
            purpose="Pending currency rule",
            currency_code="USD",
            gross_amount=Decimal("100"),
            type_data={"budgeted": True},
        )
        db.add_all([pending_board, pending_currency])
        pending_ids = (pending_board.id, pending_currency.id)

    path = f"/api/v1/workflow/preview/{request_id}"
    assert client.get(path).status_code == 401
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "requestor@payment.local", "password": "Phase01-Test-Only!"},
    )
    assert login.status_code == 200
    result = client.get(path)
    assert result.status_code == 200
    assert result.json()["provisional"] is True
    assert result.json()["policy_version"] == POLICY_VERSION
    assert result.json()["stages"][-1]["role"] == "president"
    board_route = client.get(f"/api/v1/workflow/preview/{pending_ids[0]}")
    assert board_route.status_code == 200
    assert [stage["role"] for stage in board_route.json()["stages"][-3:]] == [
        "coo", "president", "board_member"
    ]
    assert client.get(f"/api/v1/workflow/preview/{pending_ids[1]}").status_code == 422
    client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": login.json()["csrf_token"]})
    outsider = client.post(
        "/api/v1/auth/login",
        json={"email": "coo@payment.local", "password": "Phase01-Test-Only!"},
    )
    assert outsider.status_code == 200
    assert client.get(path).status_code == 404


def test_unbudgeted_board_route_has_confirmed_executive_order():
    route = route_for(
        request_type="general", budgeted=False, amount=Decimal("1000000.01"), currency_code="PHP"
    )
    assert [stage.code for stage in route.stages] == [
        "department_approval",
        "document_validation",
        "budget_review",
        "coo_approval",
        "president_approval",
        "board_approval",
    ]
