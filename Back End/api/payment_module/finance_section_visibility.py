"""Stage-aware Finance section visibility; endpoint permissions remain authoritative."""

from sqlalchemy import select

from .models import FinanceVoucherDraft, PettyCashVoucher
from .workflow_visibility import reached_stages


def finance_sections(db, request, actor, item, instance, roles):
    # Imported here because the conversation router also uses workflow role helpers.
    from .routers.conversation import participant
    from .voucher_service import assigned_instruction

    reached = {stage.get("role") for stage in reached_stages(db, instance)}
    participates = participant(db, request, actor, item)
    finance = participates and bool(roles.intersection({"finance_associate", "finance_manager"}))
    voucher_exists = (
        db.scalar(select(FinanceVoucherDraft.id).where(FinanceVoucherDraft.request_id == item.id)) is not None
    )
    if item.request_type == "pettyCash":
        voucher_exists = (
            db.scalar(select(PettyCashVoucher.id).where(PettyCashVoucher.request_id == item.id)) is not None
        )
    assigned = "authorized_signatory" in roles and bool(assigned_instruction(db, item.id, actor.id))
    return {
        "tax": bool(item.request_type != "pettyCash" and participates and "finance_associate" in reached),
        "accounting": bool(item.request_type != "pettyCash" and finance and "finance_associate" in reached),
        "voucher": bool(
            (instance.state == "approved" or voucher_exists)
            and "vouchers.read" in getattr(request.state, "permissions", set())
            and (finance or assigned)
        ),
    }
