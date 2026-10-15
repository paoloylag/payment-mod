"""Advance-backed liquidation calculations and duplicate posting protection."""

from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select

from .fund_returns import latest_return
from .models import ChartAccount, FinanceJournalSnapshot, FinanceVoucherDraft, PaymentRequest
from .payment_execution import payment_summary


def advance_source(db, item, lock=False):
    query = select(PaymentRequest).where(
        PaymentRequest.request_number == item.type_data.get("cash_advance_reference"),
        PaymentRequest.request_type == "cashAdvance",
        PaymentRequest.requestor_id == item.requestor_id,
    )
    source = db.scalar(query.with_for_update() if lock else query)
    if not source or source.status != "submitted" or source.currency_code != item.currency_code:
        raise HTTPException(409, "Select your valid Cash Advance in the same currency")
    if Decimal(str(item.type_data.get("liquidation_advance_amount", 0))) != source.gross_amount:
        raise HTTPException(409, "Liquidation advance amount must match the original Cash Advance")
    voucher = db.scalar(select(FinanceVoucherDraft).where(FinanceVoucherDraft.request_id == source.id))
    summary = payment_summary(db, voucher) if voucher else None
    if not summary or summary["state"] == "recovery_pending" or Decimal(summary["released"]) != source.gross_amount:
        raise HTTPException(409, "The original Cash Advance must be fully released before liquidation accounting")
    journal = db.get(FinanceJournalSnapshot, voucher.journal_id)
    if not journal or journal.request_id != source.id or journal.state != "posted":
        raise HTTPException(409, "The original Cash Advance requires posted accounting")
    accounts = {row["account"]["id"] for row in journal.result["entries"] if Decimal(row["debit"]) > 0}
    centers = {row["cost_center"]["id"] for row in journal.result["entries"] if Decimal(row["debit"]) > 0}
    if len(accounts) != 1 or len(centers) != 1:
        raise HTTPException(409, "Cash Advance accounting must identify one advance asset account and cost center")
    account = db.get(ChartAccount, UUID(next(iter(accounts))))
    if not account or account.account_type != "asset":
        raise HTTPException(409, "The original Cash Advance must use an advance asset account")
    return {
        "request_id": str(source.id),
        "request_number": source.request_number,
        "amount": str(source.gross_amount),
        "journal_id": str(journal.id),
        "asset_account": next(row["account"] for row in journal.result["entries"] if Decimal(row["debit"]) > 0),
        "asset_cost_center": next(row["cost_center"] for row in journal.result["entries"] if Decimal(row["debit"]) > 0),
    }


def apply_liquidation(result, source):
    remaining = Decimal(source["amount"])
    for row in result["lines"]:
        applied = min(remaining, Decimal(row["gross"]))
        row["advance_applied"] = str(applied)
        row["amount_due"] = str(Decimal(row["gross"]) - applied)
        remaining -= applied
    result["totals"].update(
        amount_due=str(sum((Decimal(row["amount_due"]) for row in result["lines"]), Decimal(0))),
        advance_applied=str(Decimal(source["amount"]) - remaining),
        cash_return_pending=str(remaining),
    )
    result["advance_source"] = source
    return result


def validate_liquidation_posting(db, item, tax):
    if item.request_type != "liquidation":
        return
    source = advance_source(db, item, lock=True)
    if source != tax.result.get("advance_source"):
        raise HTTPException(409, "The original advance changed; recalculate liquidation")
    candidates = db.scalars(
        select(PaymentRequest).where(
            PaymentRequest.request_type == "liquidation",
            PaymentRequest.id != item.id,
            PaymentRequest.type_data["cash_advance_reference"].astext == source["request_number"],
        )
    )
    for other in candidates:
        latest = db.scalar(
            select(FinanceJournalSnapshot)
            .where(FinanceJournalSnapshot.request_id == other.id)
            .order_by(FinanceJournalSnapshot.version.desc())
            .limit(1)
        )
        if latest and latest.state == "posted":
            raise HTTPException(409, "This Cash Advance already has posted liquidation accounting")


def settled_advance_references(db, requestor_id):
    references = set()
    for item in db.scalars(
        select(PaymentRequest).where(
            PaymentRequest.request_type == "liquidation",
            PaymentRequest.requestor_id == requestor_id,
            PaymentRequest.status == "submitted",
        )
    ):
        latest = db.scalar(
            select(FinanceJournalSnapshot)
            .where(FinanceJournalSnapshot.request_id == item.id)
            .order_by(FinanceJournalSnapshot.version.desc())
            .limit(1)
        )
        totals = latest.result.get("tax_totals", {}) if latest else {}
        voucher = db.scalar(select(FinanceVoucherDraft).where(FinanceVoucherDraft.request_id == item.id))
        returned = latest_return(db, voucher.id) if voucher else None
        if (
            latest
            and latest.state == "posted"
            and "advance_applied" in totals
            and (
                Decimal(totals.get("cash_return_pending", "0")) == 0
                or (
                    returned
                    and returned.state == "verified"
                    and returned.amount == Decimal(totals["cash_return_pending"])
                )
            )
        ):
            references.add(str(item.type_data.get("cash_advance_reference")))
    return references
