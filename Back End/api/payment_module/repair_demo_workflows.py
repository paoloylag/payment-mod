"""Repair only missing post-approval development fixture workflows."""

from sqlalchemy import select

from .config import get_settings
from .database import SessionLocal
from .models import PaymentRequest, User
from .seed import DEMO_USERS, seed_completed_demo_approval


def repair():
    if get_settings().app_env not in {"local", "test"}:
        raise RuntimeError("Development fixture repair is restricted to local/test")
    repaired = 0
    with SessionLocal.begin() as db:
        users = {role: db.scalar(select(User.id).where(User.email == email)) for role, email, *_ in DEMO_USERS}
        for item in db.scalars(select(PaymentRequest)):
            data = item.type_data or {}
            code = data.get("development_seed")
            if code and data.get("demo_current_step", 0) >= 9:
                repaired += int(seed_completed_demo_approval(db, item, code, users))
    return repaired


if __name__ == "__main__":
    print({"repaired": repair()})
