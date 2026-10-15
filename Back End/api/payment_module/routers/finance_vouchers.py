"""Certified voucher issuance, reversal, and recorded payment authorization."""

import hashlib
import json
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..audit import audit
from ..database import get_db
from ..finance_accounting import latest_journal, validate_saved_entries
from ..finance_configuration import lock_configuration
from ..finance_readiness import effective, finance_date
from ..finance_tax import latest_snapshot
from ..finance_validation import validation_summary
from ..fund_returns import latest_return
from ..models import (
    ChartAccount,
    FinanceJournalSnapshot,
    FinanceVoucherDraft,
    FinanceVoucherEvent,
    FinanceVoucherReplacement,
    FinanceVoucherSequence,
    PaymentInstruction,
    PaymentMethod,
    PaymentRequest,
    User,
    WorkflowEvent,
    WorkflowInstance,
)
from ..payment_execution import (
    execution_view,
    latest_line_event,
    line_state,
    payment_summary,
)
from ..security import current_user
from ..voucher_service import (
    assigned_instruction,
    latest_voucher_event,
    signatory_users,
)
from .conversation import participant
from .finance_setup import read_draft
from .requests import numbering_reset_month
from .workflow import actor_roles

router = APIRouter(prefix="/api/v1/finance-vouchers", tags=["vouchers and payment authorization"])


class VoucherCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_version: int = Field(ge=1)
    version: int = Field(ge=0)
    reason: str = Field(min_length=1, max_length=4000)


class IssueCommand(VoucherCommand):
    setup_version: int = Field(ge=1)


class ReplacementCommand(VoucherCommand):
    replacement_request_id: UUID
    replacement_request_version: int = Field(ge=1)


class InstructionCommand(VoucherCommand):
    method_id: UUID
    signatory_user_id: UUID
    reference: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")


def event_view(row):
    return {
        "id": str(row.id),
        "version": row.version,
        "state": row.state,
        "result": row.result,
        "reason": row.reason,
        "actor_user_id": str(row.actor_user_id),
        "created_at": row.created_at.isoformat(),
    }


def replacement_links(db, request, actor, item):
    links = []
    for row in db.scalars(
        select(FinanceVoucherReplacement).where(
            (FinanceVoucherReplacement.original_request_id == item.id)
            | (FinanceVoucherReplacement.replacement_request_id == item.id)
        )
    ):
        original = row.original_request_id == item.id
        other = db.get(
            PaymentRequest,
            row.replacement_request_id if original else row.original_request_id,
        )
        if other and participant(db, request, actor, other):
            links.append(
                {
                    "direction": "replaced_by" if original else "replacement_for",
                    **row.result,
                    "reason": row.reason,
                    "created_at": row.created_at.isoformat(),
                }
            )
    return links


def replacement_candidates(db, request, actor, item):
    rows = db.scalars(
        select(PaymentRequest)
        .join(FinanceVoucherDraft, FinanceVoucherDraft.request_id == PaymentRequest.id)
        .join(WorkflowInstance, WorkflowInstance.request_id == PaymentRequest.id)
        .where(
            PaymentRequest.id != item.id,
            PaymentRequest.requestor_id == item.requestor_id,
            PaymentRequest.department_id == item.department_id,
            PaymentRequest.request_type == item.request_type,
            PaymentRequest.currency_code == item.currency_code,
            PaymentRequest.status == "submitted",
            WorkflowInstance.state == "approved",
            ~select(FinanceVoucherEvent.id).where(FinanceVoucherEvent.voucher_id == FinanceVoucherDraft.id).exists(),
            ~select(FinanceVoucherReplacement.id)
            .where(FinanceVoucherReplacement.replacement_request_id == PaymentRequest.id)
            .exists(),
        )
        .order_by(PaymentRequest.created_at.desc())
        .limit(100)
    )
    return [
        {
            "id": str(row.id),
            "request_number": row.request_number,
            "request_version": row.version,
        }
        for row in rows
        if row.requestor_id != actor.id
        and participant(db, request, actor, row)
        and latest_journal(db, row.id).state == "posted"
    ]


def context(db, request, actor, request_id, lock=False):
    query = select(PaymentRequest).where(PaymentRequest.id == request_id)
    item = db.scalar(query.with_for_update() if lock else query)
    if not item:
        raise HTTPException(404, "Voucher not found")
    roles = actor_roles(db, actor)
    codes = getattr(request.state, "permissions", set())
    finance = bool(
        roles.intersection({"finance_associate", "finance_manager"}) and participant(db, request, actor, item)
    )
    assigned = "authorized_signatory" in roles and assigned_instruction(db, item.id, actor.id)
    if "vouchers.read" not in codes or not (finance or assigned):
        raise HTTPException(404, "Voucher not found")
    voucher = db.scalar(select(FinanceVoucherDraft).where(FinanceVoucherDraft.request_id == item.id))
    return item, voucher, roles, codes


def issuance_blockers(db):
    setup = read_draft(db)
    options = setup.voucher
    errors = []
    for field, label in (
        ("prefix", "Voucher prefix"),
        ("reset_basis", "Voucher numbering period"),
        ("certification_text", "Certification wording"),
    ):
        if not getattr(options, field) or not str(getattr(options, field)).strip():
            errors.append(f"Configure {label} in Request Settings")
    if (
        options.create_role != "finance_associate"
        or options.post_role != "finance_manager"
        or options.void_role != "finance_manager"
    ):
        errors.append(
            "Configure Finance Associate creation and Finance Manager posting/voiding roles in Request Settings"
        )
    return setup, errors


def visible_view(db, request, actor, item, voucher, roles, codes):
    latest = latest_voucher_event(db, voucher.id) if voucher else None
    instruction = db.scalar(select(PaymentInstruction).where(PaymentInstruction.request_id == item.id))
    journal = latest_journal(db, item.id)
    setup, blockers = issuance_blockers(db)
    excluded = {item.requestor_id, actor.id}
    if voucher:
        excluded.add(voucher.actor_user_id)
    if journal:
        excluded.add(journal.actor_user_id)
    issuer = None
    if latest:
        issuer = db.scalar(
            select(FinanceVoucherEvent).where(
                FinanceVoucherEvent.voucher_id == voucher.id,
                FinanceVoucherEvent.state == "issued",
            )
        )
        if issuer:
            excluded.add(issuer.actor_user_id)
    state = latest.state if latest else "draft" if voucher else "not_prepared"
    execution = execution_view(db, voucher, actor, roles, codes) if voucher else None
    return_source = (
        ((execution or {}).get("fund_return") or {}).get("source")
        or (voucher.result.get("advance_source") if voucher else None)
        or {}
    )
    if latest and state != "voided":
        state = execution["summary"]["state"]
    mutation_allowed = item.status == "submitted" and actor.id != item.requestor_id
    can_link = bool(
        voucher
        and state == "voided"
        and actor.id != item.requestor_id
        and "finance_manager" in roles
        and "vouchers.replace" in codes
        and not db.scalar(
            select(FinanceVoucherReplacement.id).where(FinanceVoucherReplacement.original_request_id == item.id)
        )
    )
    return {
        "replacement_links": replacement_links(db, request, actor, item),
        "can_link_replacement": can_link,
        "replacement_candidates": replacement_candidates(db, request, actor, item) if can_link else [],
        "execution": execution,
        "return_accounts": [
            {"id": str(row.id), "name": f"{row.code} — {row.name}"}
            for row in db.scalars(select(ChartAccount).order_by(ChartAccount.code))
            if "finance_associate" in roles
            and effective(row, finance_date())
            and row.is_posting
            and row.account_type == "asset"
            and (not voucher or str(row.id) != return_source.get("asset_account", {}).get("id"))
        ],
        "request_id": str(item.id),
        "request_version": item.version,
        "version": latest.version if latest else 0,
        "setup_version": setup.version,
        "state": state,
        "voucher": voucher.result if voucher else None,
        "latest": event_view(latest) if latest else None,
        "blockers": blockers if state == "draft" else [],
        "can_issue": bool(
            mutation_allowed and voucher and not latest and "finance_manager" in roles and "vouchers.issue" in codes
        ),
        "can_void": bool(
            mutation_allowed
            and voucher
            and journal
            and journal.state == "posted"
            and state != "voided"
            and "finance_manager" in roles
            and Decimal(execution["summary"]["released"]) == 0
            and not (
                execution["fund_return"]
                and execution["fund_return"]["latest"]
                and execution["fund_return"]["latest"]["state"] in {"recorded", "verified"}
            )
            and "vouchers.void" in codes
        ),
        "can_prepare_payment": bool(
            mutation_allowed and state == "issued" and "finance_associate" in roles and "payments.prepare" in codes
        ),
        "can_authorize": bool(
            mutation_allowed
            and state == "payment_prepared"
            and instruction
            and instruction.signatory_user_id == actor.id
            and "authorized_signatory" in roles
            and "payments.authorize" in codes
            and instruction.preparer_user_id != actor.id
            and voucher.actor_user_id != actor.id
        ),
        "can_print": bool(issuer),
        "payment_instruction": instruction.result if instruction else None,
        "methods": [
            {"id": str(method.id), "name": method.name}
            for method in db.scalars(select(PaymentMethod).order_by(PaymentMethod.name))
            if effective(method, finance_date())
        ],
        "signatories": [{"id": str(user.id), "name": user.display_name} for user in signatory_users(db, excluded)]
        if "finance_associate" in roles
        else [],
        "history": [
            event_view(row)
            for row in db.scalars(
                select(FinanceVoucherEvent)
                .where(FinanceVoucherEvent.voucher_id == voucher.id)
                .order_by(FinanceVoucherEvent.version.desc())
            )
        ]
        if voucher
        else [],
    }


@router.get("/queue")
def authorization_queue(request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)):
    roles = actor_roles(db, actor)
    if "authorized_signatory" not in roles or "payments.authorize" not in getattr(request.state, "permissions", set()):
        return []
    result = {}
    for instruction in db.scalars(select(PaymentInstruction).where(PaymentInstruction.signatory_user_id == actor.id)):
        latest = latest_voucher_event(db, instruction.voucher_id)
        item = db.get(PaymentRequest, instruction.request_id)
        if latest:
            pending = line_state(db, instruction)[0] == "prepared" and item.status == "submitted"
            previous = result.get(str(item.id))
            result[str(item.id)] = {
                "request_id": str(item.id),
                "request_number": item.request_number,
                "state": payment_summary(db, db.get(FinanceVoucherDraft, instruction.voucher_id))["state"],
                "pending": pending or bool(previous and previous["pending"]),
                "version": latest.version,
                "instruction": instruction.result,
            }
    return list(result.values())


@router.get("/{request_id}")
def get_voucher(
    request_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    return visible_view(db, request, actor, *context(db, request, actor, request_id))


@router.get("/{request_id}/print-data")
def print_data(
    request_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    item, voucher, roles, codes = context(db, request, actor, request_id)
    latest = latest_voucher_event(db, voucher.id) if voucher else None
    if not latest:
        raise HTTPException(409, "Issue the voucher before printing")
    issue = db.scalar(
        select(FinanceVoucherEvent).where(
            FinanceVoucherEvent.voucher_id == voucher.id,
            FinanceVoucherEvent.state == "issued",
        )
    )
    if not issue:
        raise HTTPException(409, "A voided draft has no issued voucher to print")
    instruction = db.scalar(select(PaymentInstruction).where(PaymentInstruction.voucher_id == voucher.id))
    audit(
        db,
        actor_id=actor.id,
        action="finance.voucher_printed",
        entity_type="payment_request",
        entity_id=item.id,
        request_id=request.state.request_id,
        after={"voucher_number": issue.voucher_number, "state": latest.state},
    )
    db.commit()
    return {
        **issue.result,
        "replacement_links": replacement_links(db, request, actor, item),
        "current_state": payment_summary(db, voucher)["state"],
        "execution": execution_view(db, voucher, actor, roles, codes),
        "payment_instruction": instruction.result if instruction else None,
        "history": [
            event_view(row)
            for row in db.scalars(
                select(FinanceVoucherEvent)
                .where(FinanceVoucherEvent.voucher_id == voucher.id)
                .order_by(FinanceVoucherEvent.version)
            )
        ],
    }


@router.post("/{request_id}/link-replacement")
def link_replacement(
    request_id: UUID,
    payload: ReplacementCommand,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
    key: str = Header(alias="Idempotency-Key", min_length=1, max_length=100),
):
    if request_id == payload.replacement_request_id:
        raise HTTPException(422, "A replacement must be a separate request")
    # Take both request locks in stable order, including when two originals compete for one replacement.
    list(
        db.scalars(
            select(PaymentRequest)
            .where(PaymentRequest.id.in_([request_id, payload.replacement_request_id]))
            .order_by(PaymentRequest.id)
            .with_for_update()
        )
    )
    item, voucher, roles, codes = context(db, request, actor, request_id)
    if "finance_manager" not in roles or "vouchers.replace" not in codes or item.requestor_id == actor.id:
        raise HTTPException(403, "Finance Manager replacement permission is required")
    signature = digest(payload, "link_replacement")
    existing = db.scalar(
        select(FinanceVoucherReplacement).where(FinanceVoucherReplacement.original_request_id == item.id)
    )
    if existing:
        if existing.command_key == key and existing.payload_hash == signature and existing.actor_user_id == actor.id:
            return existing.result
        raise HTTPException(409, "This voucher already has a replacement link")
    latest = latest_voucher_event(db, voucher.id) if voucher else None
    if not latest or latest.state != "voided":
        raise HTTPException(409, "Void the original voucher before linking its replacement")
    if item.version != payload.request_version or latest.version != payload.version:
        raise HTTPException(409, "Original request or voucher changed; reload")
    if not payload.reason.strip():
        raise HTTPException(422, "A replacement reason is required")
    target, target_voucher, _, _ = context(db, request, actor, payload.replacement_request_id)
    if target.requestor_id == actor.id:
        raise HTTPException(403, "You cannot link your own replacement request")
    if target.version != payload.replacement_request_version:
        raise HTTPException(409, "Replacement request changed; reload")
    if any(
        getattr(item, field) != getattr(target, field)
        for field in ("requestor_id", "department_id", "request_type", "currency_code")
    ):
        raise HTTPException(
            422,
            "Replacement must have the same requestor, department, type and currency",
        )
    workflow = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == target.id))
    journal = latest_journal(db, target.id)
    if (
        target.status != "submitted"
        or not workflow
        or workflow.state != "approved"
        or not journal
        or journal.state != "posted"
        or not target_voucher
    ):
        raise HTTPException(
            409,
            "Replacement needs independent final approval, posted accounting and a voucher draft",
        )
    if latest_voucher_event(db, target_voucher.id):
        raise HTTPException(409, "Link the replacement before its voucher is issued")
    if db.scalar(
        select(FinanceVoucherReplacement.id).where(FinanceVoucherReplacement.replacement_request_id == target.id)
    ):
        raise HTTPException(409, "Replacement request is already linked to another original")
    result = {
        "original_request_id": str(item.id),
        "original_request_number": item.request_number,
        "replacement_request_id": str(target.id),
        "replacement_request_number": target.request_number,
        "actor_name": actor.display_name,
    }
    db.add(
        FinanceVoucherReplacement(
            original_request_id=item.id,
            replacement_request_id=target.id,
            command_key=key,
            payload_hash=signature,
            reason=payload.reason.strip(),
            actor_user_id=actor.id,
            result=result,
        )
    )
    audit(
        db,
        actor_id=actor.id,
        action="finance.voucher_replacement_linked",
        entity_type="payment_request",
        entity_id=item.id,
        request_id=request.state.request_id,
        after={**result, "reason": payload.reason.strip()},
    )
    db.commit()
    return result


def record_event(db, request, actor, item, voucher, payload, key, action, result):
    row = FinanceVoucherEvent(
        request_id=item.id,
        voucher_id=voucher.id,
        version=payload.version + 1,
        state=action,
        voucher_number=result["voucher_number"] if action == "issued" else None,
        command_key=key,
        payload_hash=digest(payload, action),
        result={**result, "actor_name": actor.display_name},
        reason=payload.reason.strip(),
        actor_user_id=actor.id,
    )
    db.add(row)
    db.flush()
    audit(
        db,
        actor_id=actor.id,
        action=f"finance.voucher_{action}",
        entity_type="payment_request",
        entity_id=item.id,
        request_id=request.state.request_id,
        after=event_view(row),
    )
    db.commit()
    return event_view(row)


def digest(payload, action):
    body = payload.model_dump(mode="json")
    if body.get("recovered_amount") is None:
        body.pop("recovered_amount", None)
    return hashlib.sha256(json.dumps({"action": action, **body}, sort_keys=True).encode()).hexdigest()


def guard(db, request, actor, request_id, payload, key, action, role, permission):
    item, voucher, roles, codes = context(db, request, actor, request_id, lock=True)
    if role not in roles or permission not in codes or item.requestor_id == actor.id:
        raise HTTPException(403, f"Permission required: {permission} for {role.replace('_', ' ')}")
    if not voucher:
        raise HTTPException(409, "Prepare the voucher draft first")
    existing = db.scalar(
        select(FinanceVoucherEvent).where(
            FinanceVoucherEvent.voucher_id == voucher.id,
            FinanceVoucherEvent.command_key == key,
        )
    )
    if existing:
        if existing.payload_hash != digest(payload, action) or existing.actor_user_id != actor.id:
            raise HTTPException(409, "Idempotency key was already used for another voucher action")
        return item, voucher, existing, True
    latest = latest_voucher_event(db, voucher.id)
    if payload.version != (latest.version if latest else 0) or payload.request_version != item.version:
        raise HTTPException(409, "Voucher or request changed; reload before continuing")
    if not payload.reason.strip():
        raise HTTPException(422, "A reason is required")
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == item.id).with_for_update())
    if item.status != "submitted" or not instance or instance.state != "approved":
        raise HTTPException(409, "Final request approval is required")
    journal = latest_journal(db, item.id)
    if not journal or journal.state != "posted" or journal.id != voucher.journal_id:
        raise HTTPException(409, "The voucher requires its original posted accounting")
    tax = latest_snapshot(db, item.id)
    if journal.request_version != item.version or not tax or journal.tax_snapshot_id != tax.id:
        raise HTTPException(409, "Voucher accounting or tax source changed")
    return item, voucher, latest, False


@router.post("/{request_id}/issue")
def issue_voucher(
    request_id: UUID,
    payload: IssueCommand,
    request: Request,
    idempotency_key: str = Header(min_length=1, max_length=100),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    item, voucher, latest, repeated = guard(
        db,
        request,
        actor,
        request_id,
        payload,
        idempotency_key,
        "issued",
        "finance_manager",
        "vouchers.issue",
    )
    if repeated:
        return event_view(latest)
    if latest:
        raise HTTPException(409, "Voucher was already issued or voided")
    lock_configuration(db, shared=True)
    setup, blockers = issuance_blockers(db)
    if setup.version != payload.setup_version:
        raise HTTPException(409, "Voucher settings changed; reload before issuing")
    if blockers:
        raise HTTPException(409, "; ".join(blockers))
    journal = latest_journal(db, item.id)
    validate_saved_entries(db, journal.result)
    validation = validation_summary(db, item)
    if not validation["ready_to_approve"]:
        raise HTTPException(409, "Finance validation is incomplete")
    today = finance_date()
    options = setup.voucher
    period = (
        "ALL"
        if options.reset_basis == "continuous"
        else str(today.year - int(options.reset_basis == "academic_year" and today.month < numbering_reset_month(db)))
    )
    period_key = f"{options.prefix}:{period}"
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
        {"key": f"voucher-number:{period_key}"},
    )
    sequence = db.get(FinanceVoucherSequence, period_key, with_for_update=True)
    if not sequence:
        sequence = FinanceVoucherSequence(period_key=period_key, last_value=0)
        db.add(sequence)
    sequence.last_value += 1
    number = f"{options.prefix}-" + (f"{period}-" if period != "ALL" else "") + f"{sequence.last_value:08d}"
    approvals = [
        {
            "action": row.action,
            "note": row.note,
            "occurred_at": row.occurred_at.isoformat(),
            "actor": db.get(User, row.actor_user_id).display_name if row.actor_user_id else "System",
        }
        for row in db.scalars(
            select(WorkflowEvent)
            .where(
                WorkflowEvent.request_id == item.id,
                WorkflowEvent.action == "stage_approved",
            )
            .order_by(WorkflowEvent.occurred_at)
        )
    ]
    result = {
        **voucher.result,
        "voucher_number": number,
        "issued_on": today.isoformat(),
        "certification_text": options.certification_text.strip(),
        "certified_by": actor.display_name,
        "voucher_setup_version": setup.version,
        "voucher_controls": options.model_dump(mode="json"),
        "approval_history": approvals,
        "status": "issued",
    }
    return record_event(db, request, actor, item, voucher, payload, idempotency_key, "issued", result)


@router.post("/{request_id}/prepare-payment")
def prepare_payment(
    request_id: UUID,
    payload: InstructionCommand,
    request: Request,
    idempotency_key: str = Header(min_length=1, max_length=100),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    item, voucher, latest, repeated = guard(
        db,
        request,
        actor,
        request_id,
        payload,
        idempotency_key,
        "payment_prepared",
        "finance_associate",
        "payments.prepare",
    )
    if repeated:
        return event_view(latest)
    if not latest or latest.state != "issued":
        raise HTTPException(409, "Issue a voucher before preparing a payment instruction")
    if db.scalar(select(PaymentInstruction.id).where(PaymentInstruction.voucher_id == voucher.id)):
        raise HTTPException(409, "Use payment line items for additional payments")
    method = db.get(PaymentMethod, payload.method_id)
    if not effective(method, finance_date()) or method.category not in {
        "check",
        "bank_transfer",
        "cash",
    }:
        raise HTTPException(422, "Select an active, effective payment method")
    journal = latest_journal(db, item.id)
    eligible = signatory_users(
        db,
        {
            item.requestor_id,
            actor.id,
            voucher.actor_user_id,
            latest.actor_user_id,
            journal.actor_user_id,
        },
    )
    signatory = next((user for user in eligible if user.id == payload.signatory_user_id), None)
    if not signatory:
        raise HTTPException(
            422,
            "Assign an active signatory who did not prepare, request, issue or post this voucher",
        )
    due = Decimal(voucher.result["totals"]["amount_due"])
    if due <= 0:
        raise HTTPException(409, "A positive amount due is required for payment authorization")
    instruction_data = {
        "payee": voucher.result["payee"],
        "amount": str(due),
        "currency": voucher.result["currency"],
        "method": method.name,
        "method_id": str(method.id),
        "reference": payload.reference,
        "signatory_user_id": str(signatory.id),
        "signatory": signatory.display_name,
        "prepared_by": actor.display_name,
        "voucher_number": latest.result["voucher_number"],
    }
    instruction = PaymentInstruction(
        request_id=item.id,
        voucher_id=voucher.id,
        method_id=method.id,
        signatory_user_id=signatory.id,
        preparer_user_id=actor.id,
        reference=payload.reference,
        result=instruction_data,
    )
    db.add(instruction)
    try:
        db.flush()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(409, "This payment reference is already recorded for the selected method") from error
    return record_event(
        db,
        request,
        actor,
        item,
        voucher,
        payload,
        idempotency_key,
        "payment_prepared",
        {
            "voucher_number": latest.result["voucher_number"],
            "instruction": instruction_data,
            "payment_authorization": "pending",
        },
    )


@router.post("/{request_id}/authorize")
def authorize(
    request_id: UUID,
    payload: VoucherCommand,
    request: Request,
    idempotency_key: str = Header(min_length=1, max_length=100),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    item, voucher, latest, repeated = guard(
        db,
        request,
        actor,
        request_id,
        payload,
        idempotency_key,
        "authorized",
        "authorized_signatory",
        "payments.authorize",
    )
    if repeated:
        return event_view(latest)
    instruction = assigned_instruction(db, item.id, actor.id)
    if not latest or latest.state != "payment_prepared" or not instruction:
        raise HTTPException(409, "Only the assigned pending payment instruction can be authorized")
    if latest_line_event(db, instruction.id):
        raise HTTPException(409, "Authorize each payment line individually")
    if actor.id in {
        item.requestor_id,
        voucher.actor_user_id,
        instruction.preparer_user_id,
    }:
        raise HTTPException(403, "The requestor or preparer cannot authorize this payment")
    if not effective(db.get(PaymentMethod, instruction.method_id), finance_date()):
        raise HTTPException(409, "Payment method is no longer active")
    return record_event(
        db,
        request,
        actor,
        item,
        voucher,
        payload,
        idempotency_key,
        "authorized",
        {
            "voucher_number": instruction.result["voucher_number"],
            "instruction": instruction.result,
            "payment_authorization": "authorized",
            "authorized_by": actor.display_name,
            "payment_release": "pending",
        },
    )


@router.post("/{request_id}/void")
def void_voucher(
    request_id: UUID,
    payload: VoucherCommand,
    request: Request,
    idempotency_key: str = Header(min_length=1, max_length=100),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    item, voucher, latest, repeated = guard(
        db,
        request,
        actor,
        request_id,
        payload,
        idempotency_key,
        "voided",
        "finance_manager",
        "vouchers.void",
    )
    if repeated:
        return event_view(latest)
    if Decimal(payment_summary(db, voucher)["released"]) > 0:
        raise HTTPException(409, "A voucher with released payments cannot be voided")
    returned = latest_return(db, voucher.id)
    if returned and returned.state in {"recorded", "verified"}:
        raise HTTPException(409, "A voucher with pending or verified returned funds cannot be voided")
    journal = latest_journal(db, item.id)
    entries = [{**entry, "debit": entry["credit"], "credit": entry["debit"]} for entry in journal.result["entries"]]
    totals = {
        "debit": journal.result["totals"]["credit"],
        "credit": journal.result["totals"]["debit"],
        "difference": "0.00",
    }
    reversal = FinanceJournalSnapshot(
        request_id=item.id,
        request_version=item.version,
        tax_snapshot_id=journal.tax_snapshot_id,
        version=journal.version + 1,
        state="reversed",
        command_key=f"void:{hashlib.sha256(idempotency_key.encode()).hexdigest()}",
        payload_hash=digest(payload, "voided"),
        actor_user_id=actor.id,
        reason=payload.reason.strip(),
        result={
            **journal.result,
            "entries": entries,
            "totals": totals,
            "reverses_journal_id": str(journal.id),
            "reversed_by": actor.display_name,
        },
    )
    db.add(reversal)
    db.flush()
    audit(
        db,
        actor_id=actor.id,
        action="finance.accounting_reversed",
        entity_type="payment_request",
        entity_id=item.id,
        request_id=request.state.request_id,
        before={"journal_id": str(journal.id)},
        after={"journal_id": str(reversal.id)},
    )
    return record_event(
        db,
        request,
        actor,
        item,
        voucher,
        payload,
        idempotency_key,
        "voided",
        {
            "voucher_number": latest.result.get("voucher_number") if latest else None,
            "reversal_journal_id": str(reversal.id),
            "reversal_version": reversal.version,
            "payment_authorization": "invalidated" if latest and latest.state == "authorized" else "voided",
        },
    )
