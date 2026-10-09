from types import SimpleNamespace

import payment_module.seed as seed_module
from payment_module.database import SessionLocal
from payment_module.models import (
    ChartAccount,
    DocumentRequirementRule,
    DocumentType,
    PaymentRequest,
    RequestConversationMessage,
    SystemSetting,
    TaxCode,
    WorkflowInstance,
)
from payment_module.seed import DEMO_REQUESTS, DOCUMENT_REQUIREMENT_RULES, SEED_SETTINGS, seed, stable_id
from sqlalchemy import func, select


def test_seed_is_deterministic() -> None:
    seed(include_document_requirement_rules=True)
    with SessionLocal() as session:
        count_after_first_seed = session.scalar(select(func.count()).select_from(SystemSetting))
    seed(include_document_requirement_rules=True)
    with SessionLocal() as session:
        count = session.scalar(select(func.count()).select_from(SystemSetting))
        settings = {item.key: item.value for item in session.scalars(select(SystemSetting))}
        rules = list(session.scalars(select(DocumentRequirementRule)))
        document_codes = {item.id: item.code for item in session.scalars(select(DocumentType))}
    assert count == count_after_first_seed
    assert all(settings.get(key) == value for key, value in SEED_SETTINGS.items())
    assert len(rules) == len(DOCUMENT_REQUIREMENT_RULES)
    assert {
        (item.request_type, document_codes[item.document_type_id], item.scope, item.is_required, item.guidance)
        for item in rules
    } == set(DOCUMENT_REQUIREMENT_RULES)


def test_local_development_seed_covers_all_workflow_views_and_is_idempotent(monkeypatch, client) -> None:
    monkeypatch.setattr(
        seed_module,
        "get_settings",
        lambda: SimpleNamespace(app_env="local", development_demo_password="Phase01-Test-Only!"),
    )
    seed_module.seed(include_document_requirement_rules=True)
    seed_module.seed(include_document_requirement_rules=True)
    with SessionLocal() as session:
        demo_requests = list(
            session.scalars(
                select(PaymentRequest).where(PaymentRequest.type_data["development_seed"].astext.is_not(None))
            )
        )
        steps = {float(item.type_data["demo_current_step"]) for item in demo_requests}
        account_count = session.scalar(select(func.count()).select_from(ChartAccount))
        tax_count = session.scalar(select(func.count()).select_from(TaxCode))
        workflow_count = session.scalar(
            select(func.count())
            .select_from(WorkflowInstance)
            .where(WorkflowInstance.request_id.in_([item.id for item in demo_requests]))
        )
        message_count = session.scalar(
            select(func.count())
            .select_from(RequestConversationMessage)
            .where(RequestConversationMessage.request_id.in_([item.id for item in demo_requests]))
        )

    assert len(demo_requests) == len(DEMO_REQUESTS)
    assert steps == {1, 2, 3, 4, 5, 7, 8, 8.5, 9, 10, 11, 12, 13, 14, 15}
    assert account_count >= 5
    assert tax_count >= 3
    assert workflow_count == 18
    assert message_count == 72

    for email in (
        "department.head@payment.local",
        "finance.associate@payment.local",
        "finance.manager@payment.local",
        "coo@payment.local",
        "president@payment.local",
        "board.member@payment.local",
    ):
        client.cookies.clear()
        assert (
            client.post("/api/v1/auth/login", json={"email": email, "password": "Phase01-Test-Only!"}).status_code
            == 200
        )
        queue = client.get("/api/v1/workflow/queue")
        assert queue.status_code == 200
        seeded = [entry for entry in queue.json() if entry["request"]["type_data"].get("development_seed")]
        assert len(seeded) == 3, (email, [entry["request"]["request_number"] for entry in seeded])
        assert client.get("/api/v1/notifications").json()["unread_count"] == 3
        conversation = client.get(f"/api/v1/requests/{seeded[0]['request_id']}/conversation")
        assert conversation.status_code == 200
        assert len(conversation.json()["items"]) >= 3

    client.cookies.clear()
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": "requestor@payment.local", "password": "Phase01-Test-Only!"}
        ).status_code
        == 200
    )
    board_id = stable_id("demo-payment-request", "DEMO-BOARD-001")
    entries = client.get(f"/api/v1/requests/{board_id}/conversation").json()["items"]
    assert len(entries) == 6
    assert {entry["kind"] for entry in entries} == {"message", "information_requested", "information_provided"}
