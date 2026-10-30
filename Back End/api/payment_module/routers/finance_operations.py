"""Bounded Finance work queue and page-level currency reconciliation."""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    Department,
    FinanceJournalSnapshot,
    FinanceVoucherDraft,
    FinanceVoucherEvent,
    PaymentInstruction,
    PaymentLineEvent,
    PaymentRequest,
    User,
    WorkflowInstance,
)
from ..payment_execution import request_payment_summaries
from ..security import current_user
from ..workflow_visibility import reached_stages
from .requests import visible_query
from .workflow import actor_roles

router = APIRouter(prefix="/api/v1/finance-operations", tags=["finance work queue"])


@router.get("")
def work_queue(
    request: Request,
    department_id: UUID | None = None,
    request_type: Literal["general", "reimbursement", "poPayment", "cashAdvance", "liquidation"] | None = None,
    phase: Literal["validation", "posting", "voucher", "payment", "voided"] | None = None,
    line_state: Literal[
        "prepared",
        "authorized",
        "ready_for_pickup",
        "released",
        "cleared",
        "failed",
        "voided",
        "recovery_pending",
        "reversed",
    ]
    | None = None,
    search: str = Query(default="", max_length=100),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    finance_roles = actor_roles(db, actor).intersection({"finance_associate", "finance_manager"})
    if not finance_roles or not {"vouchers.read", "workflow.review"}.issubset(
        getattr(request.state, "permissions", set())
    ):
        raise HTTPException(403, "Finance access is required")
    journal = (
        select(FinanceJournalSnapshot)
        .distinct(FinanceJournalSnapshot.request_id)
        .order_by(FinanceJournalSnapshot.request_id, FinanceJournalSnapshot.version.desc())
        .subquery()
    )
    event = (
        select(FinanceVoucherEvent)
        .distinct(FinanceVoucherEvent.voucher_id)
        .order_by(FinanceVoucherEvent.voucher_id, FinanceVoucherEvent.version.desc())
        .subquery()
    )
    query = (
        visible_query(db, request, actor)
        .join(WorkflowInstance, WorkflowInstance.request_id == PaymentRequest.id)
        .join(Department, Department.id == PaymentRequest.department_id)
        .outerjoin(journal, journal.c.request_id == PaymentRequest.id)
        .outerjoin(FinanceVoucherDraft, FinanceVoucherDraft.request_id == PaymentRequest.id)
        .outerjoin(event, event.c.voucher_id == FinanceVoucherDraft.id)
    )
    visible_ids = visible_query(db, request, actor).with_only_columns(PaymentRequest.id).subquery()
    reached_ids = [
        instance.request_id
        for instance in db.scalars(
            select(WorkflowInstance).where(WorkflowInstance.request_id.in_(select(visible_ids.c.id)))
        )
        if any(stage["role"] in finance_roles for stage in reached_stages(db, instance))
    ]
    query = query.where(PaymentRequest.request_type != "pettyCash", PaymentRequest.id.in_(reached_ids), PaymentRequest.requestor_id != actor.id)
    departments = [
        {"id": str(department_id), "name": name}
        for department_id, name in db.execute(
            query.with_only_columns(Department.id, Department.name).distinct().order_by(Department.name)
        )
    ]
    conditions = {
        "validation": and_(
            WorkflowInstance.state != "approved",
            PaymentRequest.status.in_(["submitted", "returned"]),
            journal.c.state.is_distinct_from("reversed"),
        ),
        "posting": and_(
            WorkflowInstance.state == "approved",
            or_(journal.c.id.is_(None), journal.c.state == "draft"),
        ),
        "voucher": and_(journal.c.state == "posted", event.c.id.is_(None)),
        "payment": and_(event.c.id.is_not(None), event.c.state != "voided"),
        "voided": journal.c.state == "reversed",
    }
    if phase:
        query = query.where(conditions[phase])
    if line_state:
        latest_line = (
            select(PaymentLineEvent.state)
            .where(PaymentLineEvent.instruction_id == PaymentInstruction.id)
            .order_by(PaymentLineEvent.version.desc())
            .limit(1)
            .scalar_subquery()
        )
        recorded_state = case(
            (event.c.state == "voided", "voided"),
            else_=func.coalesce(
                latest_line,
                case((event.c.state == "authorized", "authorized"), else_="prepared"),
            ),
        )
        query = query.where(
            select(PaymentInstruction.id)
            .where(
                PaymentInstruction.voucher_id == FinanceVoucherDraft.id,
                recorded_state == line_state,
            )
            .correlate(FinanceVoucherDraft, event)
            .exists()
        )
    if department_id:
        query = query.where(PaymentRequest.department_id == department_id)
    if request_type:
        query = query.where(PaymentRequest.request_type == request_type)
    if search.strip():
        query = query.where(
            or_(
                PaymentRequest.request_number.icontains(search.strip(), autoescape=True),
                PaymentRequest.payee_name.icontains(search.strip(), autoescape=True),
            )
        )
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.execute(
        query.add_columns(
            Department.name,
            WorkflowInstance.state,
            journal.c.state,
            event.c.voucher_number,
            FinanceVoucherDraft.result,
        )
        .order_by(PaymentRequest.submitted_at.desc().nullslast(), PaymentRequest.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    summaries = request_payment_summaries(db, [row[0].id for row in rows])
    items, totals = [], {}
    now = datetime.now(UTC)
    for (
        item,
        department,
        workflow_state,
        journal_state,
        voucher_number,
        voucher_result,
    ) in rows:
        summary = summaries.get(item.id)
        stage = (
            "voided"
            if journal_state == "reversed"
            else "payment"
            if summary and summary["state"] != "draft"
            else "voucher"
            if journal_state == "posted"
            else "posting"
            if workflow_state == "approved"
            else "validation"
        )
        amounts = {
            key: (summary or {}).get(key, "0")
            for key in (
                "due",
                "allocated",
                "released",
                "cleared",
                "remaining",
                "available",
                "recovered",
                "fund_return_expected",
                "fund_return_verified",
                "fund_return_outstanding",
            )
        }
        if voucher_result and (not summary or summary["state"] == "draft"):
            amounts.update(
                due=voucher_result["totals"]["amount_due"],
                remaining=voucher_result["totals"]["amount_due"],
                available=voucher_result["totals"]["amount_due"],
            )
        if voucher_result and stage != "voided":
            currency_totals = totals.setdefault(item.currency_code, {key: Decimal(0) for key in amounts})
            for key, value in amounts.items():
                currency_totals[key] += Decimal(value)
        items.append(
            {
                "request_id": str(item.id),
                "request_number": item.request_number,
                "request_type": item.request_type,
                "payee": item.payee_name,
                "department": department,
                "currency": item.currency_code,
                "phase": stage,
                "approval_state": workflow_state,
                "payment_state": summary["state"] if summary else "not_prepared",
                "voucher_number": voucher_number,
                "age_days": max(0, (now - item.submitted_at).days) if item.submitted_at else 0,
                **amounts,
            }
        )
    return {
        "items": items,
        "departments": departments,
        "page": page,
        "page_size": page_size,
        "total": total,
        "page_totals": {
            currency: {key: str(value) for key, value in values.items()} for currency, values in totals.items()
        },
        "totals_scope": "current_page_non_voided_vouchers",
    }
