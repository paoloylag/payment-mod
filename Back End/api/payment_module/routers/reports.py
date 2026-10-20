"""Authoritative bounded request reports; exports and previews use one scoped snapshot."""

from collections import Counter, defaultdict
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Literal
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import String, or_, select, text
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Department, PaymentRequest, User, WorkflowAssignment, WorkflowInstance
from ..payment_execution import request_payment_summaries
from ..reporting import PAYMENT_LABELS, ROLE_LABELS, STAGE_LABELS, TYPE_LABELS, request_display
from ..security import current_user
from ..workflow_assignments import effective_assignee
from .requests import visible_query

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])
LIMIT = 5000
MANILA = ZoneInfo("Asia/Manila")


@router.get("/requests")
def request_report(
    request: Request,
    search: str = Query(default="", max_length=200),
    department: str = Query(default="", max_length=120),
    request_type: Literal["general", "reimbursement", "cashAdvance", "liquidation", "poPayment"] | None = None,
    status: str = Query(default="", max_length=100),
    lifecycle_status: Literal["submitted", "returned", "declined", "cancelled", "archived"] | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    min_amount: Decimal | None = Query(default=None, ge=0),
    max_amount: Decimal | None = Query(default=None, ge=0),
    sort_by: Literal["submitted", "voucher", "type", "status", "amount"] = "submitted",
    sort_direction: Literal["asc", "desc"] = "desc",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    export: bool = False,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    allowed = {"requests.read_own", "requests.read_department", "requests.read_all", "workflow.review", "vouchers.read"}
    if not allowed.intersection(request.state.permissions):
        raise HTTPException(403, "Request reporting permission required")
    if min_amount is not None and max_amount is not None and min_amount > max_amount:
        raise HTTPException(422, "Minimum amount cannot exceed maximum amount")
    if date_from and date_to and date_from > date_to:
        raise HTTPException(422, "Start date cannot be after end date")
    # Authentication has already committed session activity. Read one consistent financial snapshot.
    db.rollback()
    db.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"))
    now = datetime.now(UTC)
    query = visible_query(db, request, actor).where(PaymentRequest.status != "draft")
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
                ]
            )
        )
    if department:
        query = query.where(
            PaymentRequest.department_id.in_(
                select(Department.id).where(
                    or_(
                        Department.name == department,
                        Department.code == department,
                        Department.id.cast(String) == department,
                    )
                )
            )
        )
    if request_type:
        query = query.where(PaymentRequest.request_type == request_type)
    if lifecycle_status:
        query = query.where(PaymentRequest.status == lifecycle_status)
    if min_amount is not None:
        query = query.where(PaymentRequest.gross_amount >= min_amount)
    if max_amount is not None:
        query = query.where(PaymentRequest.gross_amount <= max_amount)
    if date_from:
        query = query.where(PaymentRequest.submitted_at >= datetime.combine(date_from, time.min, MANILA))
    if date_to:
        if date_to == date.max:
            query = query.where(PaymentRequest.submitted_at <= datetime.combine(date_to, time.max, MANILA))
        else:
            query = query.where(
                PaymentRequest.submitted_at < datetime.combine(date_to + timedelta(days=1), time.min, MANILA)
            )
    items = list(db.scalars(query.order_by(PaymentRequest.id).limit(LIMIT + 1)))
    if len(items) > LIMIT:
        raise HTTPException(
            413, "More than 5,000 candidate requests. Narrow department, date, search or amount filters."
        )
    ids = [item.id for item in items]
    workflows = {
        row.request_id: row for row in db.scalars(select(WorkflowInstance).where(WorkflowInstance.request_id.in_(ids)))
    }
    people = {
        row.id: row.display_name
        for row in db.scalars(select(User).where(User.id.in_({item.requestor_id for item in items})))
    }
    departments = dict(
        db.execute(
            select(Department.id, Department.name).where(Department.id.in_({item.department_id for item in items}))
        ).all()
    )
    assignments = {
        (row.workflow_id, row.stage_index, row.kind): row
        for row in db.scalars(
            select(WorkflowAssignment).where(WorkflowAssignment.workflow_id.in_([row.id for row in workflows.values()]))
        )
    }
    assigned_names = dict(
        db.execute(
            select(User.id, User.display_name).where(
                User.id.in_({effective_assignee(row, now) for row in assignments.values()})
            )
        ).all()
    )
    payments = request_payment_summaries(db, ids) if ids else {}
    rows = []
    for item in items:
        workflow = workflows.get(item.id)
        label, owner, purpose = item.status.title(), "Requestor", ""
        if item.status == "submitted":
            label, owner = "Submitted", "Finance"
            if (
                workflow
                and workflow.state in {"active", "information_requested"}
                and workflow.current_stage is not None
            ):
                stage = workflow.route_snapshot["stages"][workflow.current_stage]
                role = "finance_associate" if workflow.state == "information_requested" else stage["role"]
                purpose = stage["purpose"]
                label = (
                    ("Information Requested by " + ROLE_LABELS.get(stage["role"], stage["role"]))
                    if workflow.state == "information_requested"
                    else STAGE_LABELS.get(role, purpose)
                )
                assignment = assignments.get(
                    (
                        workflow.id,
                        workflow.current_stage,
                        "response" if workflow.state == "information_requested" else "approval",
                    )
                )
                owner = (
                    assigned_names.get(effective_assignee(assignment, now), ROLE_LABELS.get(role, role))
                    if assignment
                    else ROLE_LABELS.get(role, role)
                )
            elif workflow and workflow.state == "approved":
                label, owner = "Approved — Finance Processing", "Finance Associate"
            payment_state = payments.get(item.id, {}).get("state")
            if payment_state in PAYMENT_LABELS:
                label = PAYMENT_LABELS[payment_state]
                owner = (
                    "Finance Manager"
                    if payment_state in {"released", "recovery_pending", "fund_return_pending"}
                    else "Authorized Signatory"
                    if payment_state == "payment_prepared"
                    else "Finance Associate"
                )
        elif item.status == "returned":
            label = "Returned for Information"
        label = request_display(item, workflow, payments.get(item.id, {}))["display_status"]
        if status and status.casefold() not in {label.casefold(), purpose.casefold()}:
            continue
        rows.append(
            {
                "request_id": str(item.id),
                "id": item.request_number or str(item.id),
                "voucher": item.voucher_number or "",
                "submitted": item.submitted_at.astimezone(MANILA).date().isoformat() if item.submitted_at else "",
                "department": departments.get(item.department_id, ""),
                "requestor": people.get(item.requestor_id, ""),
                "payee": item.payee_name,
                "type": TYPE_LABELS[item.request_type],
                "type_code": item.request_type,
                "currency": item.currency_code,
                "amount": str(item.gross_amount),
                "status": label,
                "lifecycle_status": item.status,
                "owner": owner,
                "aging_days": max(0, (now - item.submitted_at).days) if item.submitted_at else None,
            }
        )
    key = {"submitted": "submitted", "voucher": "voucher", "type": "type", "status": "status", "amount": "amount"}[
        sort_by
    ]
    rows.sort(
        key=lambda row: (Decimal(row[key]) if key == "amount" else row[key], row["request_id"]),
        reverse=sort_direction == "desc",
    )
    totals = defaultdict(Decimal)
    for row in rows:
        totals[row["currency"]] += Decimal(row["amount"])
    count = len(rows)
    filters = {
        "search": search,
        "department": department,
        "request_type": request_type,
        "status": status,
        "lifecycle_status": lifecycle_status,
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "min_amount": str(min_amount) if min_amount is not None else None,
        "max_amount": str(max_amount) if max_amount is not None else None,
        "sort_by": sort_by,
        "sort_direction": sort_direction,
    }
    return {
        "report_number": "PTR-" + now.strftime("%Y%m%d") + "-" + uuid4().hex[:8],
        "generated_at": now.astimezone(MANILA).isoformat(),
        "generated_by": actor.display_name,
        "filters": filters,
        "total": count,
        "page": page,
        "page_size": page_size,
        "items": rows if export else rows[(page - 1) * page_size : page * page_size],
        "summary": {
            "status_counts": dict(Counter(row["status"] for row in rows)),
            "currency_totals": {currency: str(amount) for currency, amount in sorted(totals.items())},
        },
        "definitions": {
            "amount": "Request gross amount; not voucher net due or payment settlement",
            "aging": "Completed elapsed days since submission; not an SLA/overdue determination",
            "scope": "All filtered visible non-draft requests, including returned/declined/cancelled history",
        },
    }
