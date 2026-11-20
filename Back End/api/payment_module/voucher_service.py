"""Voucher lifecycle reads shared by request visibility and payment authorization."""

from sqlalchemy import select

from .models import FinanceVoucherEvent, PaymentInstruction, Role, User, UserRole
from .security import effective_permissions


def latest_voucher_event(db, voucher_id):
    return db.scalar(
        select(FinanceVoucherEvent)
        .where(FinanceVoucherEvent.voucher_id == voucher_id)
        .order_by(FinanceVoucherEvent.version.desc())
        .limit(1)
    )


def assigned_instruction(db, request_id, user_id):
    return db.scalar(
        select(PaymentInstruction).where(
            PaymentInstruction.request_id == request_id, PaymentInstruction.signatory_user_id == user_id
        )
    )


def signatory_users(db, excluded=()):
    return [
        user
        for user in db.scalars(
            select(User)
            .join(UserRole)
            .join(Role, Role.id == UserRole.role_id)
            .where(Role.code == "authorized_signatory", User.is_active.is_(True), User.is_suspended.is_(False))
            .order_by(User.display_name)
        )
        if user.id not in excluded and "payments.authorize" in effective_permissions(db, user.id)
    ]
