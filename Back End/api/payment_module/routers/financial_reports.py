"""Finance reconciliation from one permission-scoped, read-only snapshot."""

from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import String, or_, select, text
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Department,
    FinanceJournalSnapshot,
    FinanceVoucherDraft,
    FinanceVoucherEvent,
    FundReturnEvent,
    PaymentInstruction,
    PaymentLineEvent,
    PaymentMethod,
    PaymentRequest,
    User,
)
from ..payment_execution import request_payment_summaries
from ..security import current_user
from ..workflow_assignments import user_roles
from .requests import visible_query

router = APIRouter(prefix="/api/v1/reports", tags=["Finance reconciliation"])
MANILA = ZoneInfo("Asia/Manila")
LIMIT = 5000
LINE_LIMIT = 20000
ZERO = Decimal(0)
KINDS = {
    "payments": (
        "Payment reconciliation",
        ["due", "released", "cleared", "uncleared", "remaining", "available", "recovered", "unclaimed_amount"],
    ),
    "advances": (
        "Cash advance reconciliation",
        ["requested", "released", "applied", "verified_return", "outstanding", "excess_due"],
    ),
    "returns": ("Fund return reconciliation", ["expected", "recorded", "verified_return", "outstanding"]),
    "recoveries": ("Payment recovery reconciliation", ["amount", "pending_recovery", "verified_recovery"]),
}


def latest_rows(db, model, key, ids):
    if not ids:
        return {}
    column = getattr(model, key)
    return {
        getattr(row, key): row
        for row in db.scalars(
            select(model).where(column.in_(ids)).distinct(column).order_by(column, model.version.desc())
        )
    }


def elapsed_bucket(days):
    return (
        "0–7 days"
        if days <= 7
        else "8–30 days"
        if days <= 30
        else "31–60 days"
        if days <= 60
        else "61–90 days"
        if days <= 90
        else "91+ days"
    )


@router.get("/finance")
def finance_report(
    request: Request,
    kind: Literal["payments", "advances", "returns", "recoveries"] = "payments",
    search: str = Query(default="", max_length=200),
    department_id: str = Query(default="", max_length=120),
    currency: str = Query(default="", max_length=3),
    state: str = Query(default="", max_length=40),
    age_bucket: str = Query(default="", max_length=40),
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    export: bool = False,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    if (
        not user_roles(db, actor).intersection({"finance_associate", "finance_manager"})
        or "vouchers.read" not in request.state.permissions
    ):
        raise HTTPException(403, "Finance reporting access required")
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "Start date cannot be after end date")
    if age_bucket and age_bucket not in {"0–7 days", "8–30 days", "31–60 days", "61–90 days", "91+ days"}:
        raise HTTPException(422, "Select an available elapsed-time bucket")
    db.rollback()
    db.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"))
    now = datetime.now(UTC)
    query = visible_query(db, request, actor).where(PaymentRequest.status != "draft")
    if kind == "advances":
        query = query.where(PaymentRequest.request_type == "cashAdvance")
    else:
        query = query.where(PaymentRequest.id.in_(select(FinanceVoucherDraft.request_id)))
    if department_id:
        query = query.where(
            PaymentRequest.department_id.in_(
                select(Department.id).where(
                    or_(
                        Department.id.cast(String) == department_id,
                        Department.code == department_id,
                        Department.name == department_id,
                    )
                )
            )
        )
    if currency:
        query = query.where(PaymentRequest.currency_code == currency.upper())
    if search.strip():
        needle = "%" + search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        query = query.where(
            or_(
                *[
                    column.ilike(needle, escape="\\")
                    for column in (
                        PaymentRequest.request_number,
                        PaymentRequest.voucher_number,
                        PaymentRequest.payee_name,
                        PaymentRequest.purpose,
                    )
                ],
                PaymentRequest.id.in_(
                    select(PaymentInstruction.request_id).where(PaymentInstruction.reference.ilike(needle, escape="\\"))
                ),
            )
        )
    if date_from:
        query = query.where(PaymentRequest.submitted_at >= datetime.combine(date_from, time.min, MANILA))
    if date_to:
        boundary = (
            datetime.combine(date_to, time.max, MANILA)
            if date_to == date.max
            else datetime.combine(date_to + timedelta(days=1), time.min, MANILA)
        )
        query = query.where(
            PaymentRequest.submitted_at <= boundary if date_to == date.max else PaymentRequest.submitted_at < boundary
        )
    items = list(
        db.scalars(query.order_by(PaymentRequest.submitted_at.desc().nulls_last(), PaymentRequest.id).limit(LIMIT + 1))
    )
    if len(items) > LIMIT:
        raise HTTPException(413, "More than 5,000 candidate requests. Narrow search, department, currency or dates.")
    ids = [item.id for item in items]
    vouchers = {
        row.request_id: row
        for row in db.scalars(select(FinanceVoucherDraft).where(FinanceVoucherDraft.request_id.in_(ids)))
    }
    voucher_ids = [row.id for row in vouchers.values()]
    voucher_events = latest_rows(db, FinanceVoucherEvent, "voucher_id", voucher_ids)
    returns = latest_rows(db, FundReturnEvent, "voucher_id", voucher_ids)
    instructions = list(
        db.scalars(
            select(PaymentInstruction)
            .where(PaymentInstruction.request_id.in_(ids))
            .order_by(PaymentInstruction.request_id, PaymentInstruction.sequence)
            .limit(LINE_LIMIT + 1)
        )
    )
    if len(instructions) > LINE_LIMIT:
        raise HTTPException(413, "More than 20,000 payment lines. Narrow the report filters.")
    line_ids = [row.id for row in instructions]
    events = latest_rows(db, PaymentLineEvent, "instruction_id", line_ids)
    recovery_events = {}
    if line_ids:
        recovery_events = {
            row.instruction_id: row
            for row in db.scalars(
                select(PaymentLineEvent)
                .where(
                    PaymentLineEvent.instruction_id.in_(line_ids),
                    or_(
                        PaymentLineEvent.state.in_(["recovery_pending", "reversed"]),
                        PaymentLineEvent.result["recovery_rejected"].astext == "true",
                    ),
                )
                .distinct(PaymentLineEvent.instruction_id)
                .order_by(PaymentLineEvent.instruction_id, PaymentLineEvent.version.desc())
            )
        }
    people_ids = {item.requestor_id for item in items} | {row.signatory_user_id for row in instructions}
    people = dict(db.execute(select(User.id, User.display_name).where(User.id.in_(people_ids))).all())
    departments = dict(
        db.execute(
            select(Department.id, Department.name).where(Department.id.in_({item.department_id for item in items}))
        ).all()
    )
    methods = dict(
        db.execute(
            select(PaymentMethod.id, PaymentMethod.name).where(
                PaymentMethod.id.in_({row.method_id for row in instructions})
            )
        ).all()
    )
    payments = request_payment_summaries(db, ids)
    related = []
    if kind == "advances":
        references = [item.request_number for item in items if item.request_number]
        related = list(
            db.scalars(
                visible_query(db, request, actor)
                .where(
                    PaymentRequest.request_type == "liquidation",
                    PaymentRequest.type_data["cash_advance_reference"].astext.in_(references),
                )
                .limit(LIMIT + 1)
            )
        )
        if len(related) > LIMIT:
            raise HTTPException(413, "Too many related liquidations. Narrow report filters.")
    journals = latest_rows(db, FinanceJournalSnapshot, "request_id", [row.id for row in related])
    related_vouchers = {
        row.request_id: row
        for row in db.scalars(
            select(FinanceVoucherDraft).where(FinanceVoucherDraft.request_id.in_([item.id for item in related]))
        )
    }
    related_returns = latest_rows(db, FundReturnEvent, "voucher_id", [row.id for row in related_vouchers.values()])
    related_by_reference = defaultdict(list)
    for liquidation in related:
        related_by_reference[liquidation.type_data.get("cash_advance_reference")].append(liquidation)
    by_request = defaultdict(list)
    for instruction in instructions:
        by_request[instruction.request_id].append(instruction)
    rows, lines = [], []
    title, money_fields = KINDS[kind]
    for item in items:
        voucher = vouchers.get(item.id)
        ve = voucher_events.get(voucher.id) if voucher else None
        returned = returns.get(voucher.id) if voucher else None
        payment = payments.get(item.id, {})
        days = max(0, (now - item.submitted_at).days) if item.submitted_at else None
        base = {
            "request_id": str(item.id),
            "request": item.request_number or str(item.id),
            "voucher": item.voucher_number or "",
            "requestor": people.get(item.requestor_id, ""),
            "department": departments.get(item.department_id, ""),
            "payee": item.payee_name,
            "currency": item.currency_code,
            "submitted": item.submitted_at.astimezone(MANILA).date().isoformat() if item.submitted_at else "",
            "elapsed_days": days,
            "age_bucket": elapsed_bucket(days) if days is not None else "Not submitted",
        }
        item_lines = []
        for instruction in by_request[item.id]:
            event = events.get(instruction.id)
            line_state = (
                "voided"
                if ve and ve.state == "voided"
                else event.state
                if event
                else "authorized"
                if ve and ve.state == "authorized"
                else "prepared"
            )
            item_lines.append(
                {
                    **base,
                    "line_id": str(instruction.id),
                    "sequence": instruction.sequence,
                    "reference": instruction.reference,
                    "method": methods.get(instruction.method_id, ""),
                    "signatory": people.get(instruction.signatory_user_id, ""),
                    "amount": str(instruction.amount),
                    "state": line_state,
                    "predecessor_id": str(instruction.predecessor_id) if instruction.predecessor_id else "",
                    "updated_at": event.created_at.astimezone(MANILA).isoformat()
                    if event
                    else instruction.created_at.astimezone(MANILA).isoformat(),
                }
            )
        if kind == "payments":
            sums = {
                field: str(Decimal(payment.get(field, "0")))
                for field in money_fields
                if field not in {"uncleared", "unclaimed_amount"}
            }
            sums["uncleared"] = str(Decimal(payment.get("released", "0")) - Decimal(payment.get("cleared", "0")))
            sums["unclaimed_amount"] = str(
                sum((Decimal(line["amount"]) for line in item_lines if line["state"] == "ready_for_pickup"), ZERO)
            )
            rows.append(
                {
                    **base,
                    **sums,
                    "state": payment.get("state", "draft"),
                    "included_in_totals": not (ve and ve.state == "voided"),
                    "unclaimed_checks": payment.get("unclaimed_check_count", 0),
                }
            )
            lines.extend(item_lines)
        elif kind == "returns" and returned:
            expected = Decimal(payment.get("fund_return_expected", "0"))
            # Rejected full-advance returns still show the amount that was offered for return.
            if item.request_type == "cashAdvance":
                expected = item.gross_amount
            verified = returned.amount if returned.state == "verified" else ZERO
            rows.append(
                {
                    **base,
                    "state": returned.state,
                    "expected": str(expected),
                    "recorded": str(returned.amount),
                    "verified_return": str(verified),
                    "outstanding": str(expected - verified),
                    "reference": returned.result.get("reference", ""),
                    "recorded_on": returned.result.get("recorded_on", ""),
                    "receiving_office": returned.result.get("receiving_office", ""),
                    "reviewed_by": returned.result.get("actor_name", ""),
                    "reason": returned.reason,
                }
            )
        elif kind == "recoveries":
            for line in item_lines:
                recovery = recovery_events.get(UUID(line["line_id"]))
                if not recovery:
                    continue
                status = (
                    "rejected"
                    if recovery.result.get("recovery_rejected")
                    else "verified"
                    if recovery.state == "reversed"
                    else "pending"
                )
                amount = Decimal(line["amount"])
                rows.append(
                    {
                        **line,
                        "state": status,
                        "payment_state": line["state"],
                        "pending_recovery": str(amount if status == "pending" else ZERO),
                        "verified_recovery": str(amount if status == "verified" else ZERO),
                        "reason": recovery.reason,
                        "replacement_ids": ", ".join(
                            str(candidate.id)
                            for candidate in by_request[item.id]
                            if candidate.predecessor_id == UUID(line["line_id"])
                        ),
                    }
                )
        elif kind == "advances":
            released = Decimal(payment.get("released", "0")) if not (ve and ve.state == "voided") else ZERO
            applied, verified, excess = ZERO, ZERO, ZERO
            refs = []
            for liquidation in related_by_reference[item.request_number]:
                if (
                    liquidation.type_data.get("cash_advance_reference") != item.request_number
                    or liquidation.requestor_id != item.requestor_id
                    or liquidation.currency_code != item.currency_code
                ):
                    continue
                journal = journals.get(liquidation.id)
                if not journal or journal.state != "posted":
                    continue
                totals = journal.result.get("tax_totals", {})
                applied += Decimal(totals.get("advance_applied", "0"))
                excess += Decimal(totals.get("amount_due", "0"))
                refs.append(liquidation.request_number or str(liquidation.id))
                lv = related_vouchers.get(liquidation.id)
                lr = related_returns.get(lv.id) if lv else None
                if lr and lr.state == "verified":
                    verified += lr.amount
            if returned and returned.state == "verified":
                verified += returned.amount
            outstanding = released - applied - verified
            status = (
                "exception"
                if outstanding < 0
                else "not_released"
                if released == 0
                else "settled"
                if outstanding == 0
                else "outstanding"
            )
            rows.append(
                {
                    **base,
                    "state": status,
                    "requested": str(item.gross_amount),
                    "released": str(released),
                    "applied": str(applied),
                    "verified_return": str(verified),
                    "outstanding": str(outstanding),
                    "excess_due": str(excess),
                    "liquidations": ", ".join(refs),
                    "return_state": returned.state if returned else "",
                    "payment_state": payment.get("state", "not_prepared"),
                }
            )
    rows = [
        row
        for row in rows
        if (
            not state
            or row["state"] == state
            or (kind == "payments" and state == "unclaimed" and row.get("unclaimed_checks", 0) > 0)
        )
        and (not age_bucket or row["age_bucket"] == age_bucket)
    ]
    selected_ids = {row["request_id"] for row in rows}
    lines = [row for row in lines if row["request_id"] in selected_ids]
    totals = defaultdict(lambda: defaultdict(Decimal))
    aging = defaultdict(int)
    for row in rows:
        aging[row["age_bucket"]] += 1
        if row.get("included_in_totals", True):
            for field in money_fields:
                totals[row["currency"]][field] += Decimal(row[field])
    selected = rows if export else rows[(page - 1) * page_size : page * page_size]
    page_ids = {row["request_id"] for row in selected}
    return {
        "title": title,
        "kind": kind,
        "generated_at": now.astimezone(MANILA).isoformat(),
        "generated_by": actor.display_name,
        "filters": {
            "search": search,
            "department_id": department_id,
            "currency": currency,
            "state": state,
            "age_bucket": age_bucket,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        },
        "total": len(rows),
        "page": page,
        "page_size": page_size,
        "items": selected,
        "payment_lines": lines if export else [row for row in lines if row["request_id"] in page_ids],
        "money_fields": money_fields,
        "summary": {
            "currency_totals": {
                currency: {field: str(amount) for field, amount in sums.items()}
                for currency, sums in sorted(totals.items())
            },
            "aging_counts": dict(aging),
        },
        "definitions": {
            "scope": (
                "All matching permitted records; totals cover all pages. Voided vouchers excluded from payment totals."
            ),
            "payments": (
                "Due = net voucher payable. Released/cleared are net of verified payment recoveries; "
                "pending recovery remains released. Remaining = due minus net released; uncleared = "
                "released minus cleared."
            ),
            "advances": (
                "Outstanding = net released advance minus advance applied by posted liquidation "
                "accounting minus verified fund returns. Excess payable belongs to the Liquidation "
                "voucher; it is not another advance."
            ),
            "aging": (
                "Elapsed full days since request submission. Buckets describe age only; they are not an "
                "SLA or overdue policy."
            ),
            "snapshot": (
                "Current state at generation; date filters select request submission dates in "
                "Asia/Manila, not historical as-of balances."
            ),
        },
    }
