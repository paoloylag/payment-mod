"""Immutable receipt status for unused advance funds."""

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select

from .models import Document, DocumentVersion, FundReturnEvent


def latest_return(db, voucher_id):
    return db.scalar(
        select(FundReturnEvent)
        .where(FundReturnEvent.voucher_id == voucher_id)
        .order_by(FundReturnEvent.version.desc())
        .limit(1)
    )


def return_view(row):
    return {
        "id": str(row.id),
        "version": row.version,
        "state": row.state,
        "amount": str(row.amount.quantize(Decimal("0.0001"))),
        "result": row.result,
        "reason": row.reason,
        "actor_user_id": str(row.actor_user_id),
        "created_at": row.created_at.isoformat(),
    }


def return_amounts(voucher, latest, offer_full_advance=False):
    expected = (
        Decimal(voucher.result["totals"]["gross"])
        if voucher.result.get("request_type") == "cashAdvance"
        and (offer_full_advance or (latest and latest.state in {"recorded", "verified"}))
        else Decimal(voucher.result["totals"].get("cash_return_pending", "0"))
    )
    verified = latest.amount if latest and latest.state == "verified" else Decimal(0)
    return {"expected": str(expected), "verified": str(verified), "outstanding": str(expected - verified)}


def full_advance_source(item, voucher):
    entries = [row for row in voucher.result["entries"] if Decimal(row["debit"]) > 0]
    if (
        not entries
        or len({row["account"]["id"] for row in entries}) != 1
        or len({row["cost_center"]["id"] for row in entries}) != 1
    ):
        return None
    return {
        "request_id": str(item.id),
        "request_number": item.request_number,
        "amount": str(item.gross_amount),
        "journal_id": str(voucher.journal_id),
        "asset_account": entries[0]["account"],
        "asset_cost_center": entries[0]["cost_center"],
    }


def receipt_available(db, result):
    version = db.get(DocumentVersion, UUID(result["document_version_id"]))
    document = db.get(Document, version.document_id) if version else None
    return bool(version and version.state == "available" and document and not document.removed_at)
