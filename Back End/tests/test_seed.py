from payment_module.database import SessionLocal
from payment_module.models import SystemSetting
from payment_module.seed import SEED_SETTINGS, seed
from sqlalchemy import func, select


def test_seed_is_deterministic() -> None:
    seed()
    seed()
    with SessionLocal() as session:
        count = session.scalar(select(func.count()).select_from(SystemSetting))
        settings = {item.key: item.value for item in session.scalars(select(SystemSetting))}
    assert count == len(SEED_SETTINGS)
    assert settings == SEED_SETTINGS
