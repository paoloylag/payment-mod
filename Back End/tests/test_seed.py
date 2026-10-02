from types import SimpleNamespace

import payment_module.seed as seed_module
from payment_module.database import SessionLocal
from payment_module.models import (
    ChartAccount,
    DocumentRequirementRule,
    DocumentType,
    PaymentRequest,
    SystemSetting,
    TaxCode,
)
from payment_module.seed import DEMO_REQUESTS, DOCUMENT_REQUIREMENT_RULES, SEED_SETTINGS, seed
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


def test_local_development_seed_covers_all_workflow_views_and_is_idempotent(monkeypatch) -> None:
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

    assert len(demo_requests) == len(DEMO_REQUESTS)
    assert steps == {1, 2, 3, 4, 5, 7, 8, 8.5, 9, 10, 11, 12, 13, 14, 15}
    assert account_count >= 5
    assert tax_count >= 3
