"""Consistent dashboard cards and membership, scoped before calculation."""

from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    FinanceJournalSnapshot,
    FinanceVoucherDraft,
    FinanceVoucherEvent,
    PaymentInstruction,
    PaymentLineEvent,
    PaymentRequest,
    User,
    WorkflowAssignment,
    WorkflowInstance,
)
from ..payment_execution import request_payment_summaries
from ..reporting import request_display
from ..security import current_user
from ..workflow_assignments import effective_assignee, user_roles
from .financial_reports import latest_rows
from .requests import visible_query

router = APIRouter(prefix="/api/v1/reports", tags=["dashboard"])
LIMIT = 5000


@router.get("/dashboard")
def dashboard_snapshot(request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)):
    if not {
        "requests.read_own",
        "requests.read_department",
        "requests.read_all",
        "workflow.review",
        "vouchers.read",
    }.intersection(request.state.permissions):
        raise HTTPException(403, "Request access required")
    db.rollback()
    db.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"))
    items = list(db.scalars(visible_query(db, request, actor).where(PaymentRequest.status != "draft").limit(LIMIT + 1)))
    if len(items) > LIMIT:
        raise HTTPException(413, "Dashboard exceeds the 5,000-request interactive limit. Use filtered Finance reports.")
    ids = [item.id for item in items]
    workflows = {
        row.request_id: row for row in db.scalars(select(WorkflowInstance).where(WorkflowInstance.request_id.in_(ids)))
    }
    assignments = {
        (row.workflow_id, row.stage_index, row.kind): row
        for row in db.scalars(
            select(WorkflowAssignment).where(WorkflowAssignment.workflow_id.in_([row.id for row in workflows.values()]))
        )
    }
    payments = request_payment_summaries(db, ids)
    roles = user_roles(db, actor)
    instructions = list(
        db.scalars(
            select(PaymentInstruction).where(
                PaymentInstruction.request_id.in_(ids), PaymentInstruction.signatory_user_id == actor.id
            )
        )
    )
    events = latest_rows(db, PaymentLineEvent, "instruction_id", [row.id for row in instructions])
    vouchers = {
        row.id: row
        for row in db.scalars(
            select(FinanceVoucherDraft).where(FinanceVoucherDraft.id.in_({row.voucher_id for row in instructions}))
        )
    }
    voucher_events = latest_rows(db, FinanceVoucherEvent, "voucher_id", list(vouchers))
    journal_actors = dict(
        db.execute(
            select(FinanceJournalSnapshot.id, FinanceJournalSnapshot.actor_user_id).where(
                FinanceJournalSnapshot.id.in_({row.journal_id for row in vouchers.values()})
            )
        ).all()
    )
    signatory_pending = set()
    totals = defaultdict(Decimal)
    membership = {"open": [], "pending": [], "returned": [], "unclaimed": []}
    updates = {}
    check_count = 0
    now = datetime.now(UTC)
    reviewer = "workflow.review" in request.state.permissions
    for item in items:
        workflow, payment = workflows.get(item.id), payments.get(item.id, {})
        key = str(item.id)
        updates[key] = {
            **request_display(item, workflow, payment),
            "payment_summary": payment or None,
            "approval_state": workflow.state if workflow else None,
            "version": item.version,
        }
        if not (item.request_type == "pettyCash" and workflow and workflow.state == "approved") and item.status in {"submitted", "returned"} and payment.get("state") not in {
            "cleared",
            "funds_returned",
            "settled_no_payment",
        }:
            membership["open"].append(key)
            totals[item.currency_code] += item.gross_amount
        if item.status == "returned":
            membership["returned"].append(key)
        if payment.get("unclaimed_check_count", 0):
            membership["unclaimed"].append(key)
            check_count += payment["unclaimed_check_count"]
        pending = item.id in signatory_pending and item.requestor_id != actor.id
        if (
            item.status == "submitted"
            and workflow
            and workflow.state in {"active", "information_requested"}
            and workflow.current_stage is not None
        ):
            stage = workflow.route_snapshot["stages"][workflow.current_stage]
            role = "finance_associate" if workflow.state == "information_requested" else stage["role"]
            assignment = assignments.get(
                (
                    workflow.id,
                    workflow.current_stage,
                    "response" if workflow.state == "information_requested" else "approval",
                )
            )
            eligible = (
                reviewer
                and role in roles
                and actor.id != item.requestor_id
                and (role != "department_head" or actor.department_id == item.department_id)
            )
            pending |= bool(eligible and (assignment is None or effective_assignee(assignment, now) == actor.id))
            # A requestor sees their own requests waiting for approval; reviewers see their actionable queue.
            if not reviewer and "authorized_signatory" not in roles and item.requestor_id == actor.id:
                pending = True
        if pending:
            membership["pending"].append(key)
    return {
        "generated_at": now.astimezone(ZoneInfo("Asia/Manila")).isoformat(),
        "membership": membership,
        "currency_totals": {currency: str(amount) for currency, amount in sorted(totals.items())},
        "unclaimed_check_count": check_count,
        "requests": updates,
        "definition": (
            "Open gross request value excludes cleared, verified-return and settled-no-payment requests; "
            "it is not unpaid liability."
        ),
    }
