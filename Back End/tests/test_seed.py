from payment_module.database import SessionLocal
from payment_module.models import DocumentRequirementRule, DocumentType, SystemSetting
from payment_module.seed import DOCUMENT_REQUIREMENT_RULES, SEED_SETTINGS, seed
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
        document_codes = {
            item.id: item.code for item in session.scalars(select(DocumentType))
        }
    assert count == count_after_first_seed
    assert all(settings.get(key) == value for key, value in SEED_SETTINGS.items())
    assert len(rules) == len(DOCUMENT_REQUIREMENT_RULES)
    assert {
        (item.request_type, document_codes[item.document_type_id], item.scope, item.is_required, item.guidance)
        for item in rules
    } == set(DOCUMENT_REQUIREMENT_RULES)
