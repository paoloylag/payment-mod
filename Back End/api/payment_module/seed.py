from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select

from .database import SessionLocal
from .models import SystemSetting

SEED_SETTINGS = {
    "application.name": "Automated Payment System",
    "application.timezone": "Asia/Manila",
    "application.phase": "0",
    "data_source.default": "hybrid",
}


def seed() -> None:
    with SessionLocal.begin() as session:
        for key, value in SEED_SETTINGS.items():
            setting = session.scalar(select(SystemSetting).where(SystemSetting.key == key))
            if setting is None:
                session.add(SystemSetting(id=uuid5(NAMESPACE_URL, f"payment-module:{key}"), key=key, value=value))
            else:
                setting.value = value


if __name__ == "__main__":
    seed()
    print(f"Seeded {len(SEED_SETTINGS)} system settings.")
