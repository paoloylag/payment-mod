"""Voucher payment line preparation, evidence, release, clearing and replacement."""

import hashlib
import json
from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Request, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..audit import audit
from ..database import get_db
from ..finance_accounting import latest_journal
from ..finance_readiness import effective, finance_date
from ..finance_tax import latest_snapshot
from ..models import (
    Currency,
    Document,
    DocumentReviewDecision,
    FinanceVoucherEvent,
    PaymentEvidence,
    PaymentInstruction,
    PaymentLineEvent,
    PaymentMethod,
    User,
    WorkflowInstance,
)
from ..payment_execution import event_view, evidence_view, execution_view, line_state, payment_summary, recovery_blocker
from ..security import current_user
from ..voucher_service import latest_voucher_event, signatory_users
from .documents import _prepare, _store_version, get_storage
from .finance_vouchers import VoucherCommand, context, digest, guard, record_event
from .finance_vouchers import event_view as voucher_event_view

router = APIRouter(prefix="/api/v1/payments", tags=["payment execution"])


class PaymentLine(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount: Decimal = Field(gt=0, max_digits=19, decimal_places=4)
    method_id: UUID
    signatory_user_id: UUID
    reference: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9][A-Za-z0-9._/-]*$")
    label: str = Field(min_length=1, max_length=200)
    predecessor_id: UUID | None = None


class PaymentSchedule(VoucherCommand):
    lines: list[PaymentLine] = Field(min_length=1, max_length=50)


class PaymentAction(VoucherCommand):
    evidence_id: UUID | None = None
    bank_name: str = Field(default="", max_length=160)
    recipient_name: str = Field(default="", max_length=200)
    recorded_on: date | None = None
    recovered_amount: Decimal | None = Field(default=None, gt=0, max_digits=19, decimal_places=4)


def save_line_event(db, request, actor, instruction, payload, key, state, result, event_action=None):
    row = PaymentLineEvent(
        instruction_id=instruction.id,
        version=payload.version + 1,
        state=state,
        command_key=key,
        payload_hash=digest(payload, event_action or state),
        result={**result, "actor_name": actor.display_name},
        reason=payload.reason.strip(),
        actor_user_id=actor.id,
    )
    db.add(row)
    db.flush()
    from ..outbox import record_payment_notification

    record_payment_notification(db, instruction, row)
    audit(
        db,
        actor_id=actor.id,
        action=f"payment.{event_action or state}",
        entity_type="payment_instruction",
        entity_id=instruction.id,
        request_id=request.state.request_id,
        after=event_view(row),
    )
    return row


@router.get("/{request_id}")
def payment_details(
    request_id: UUID, request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)
):
    item, voucher, roles, permissions = context(db, request, actor, request_id)
    if not voucher:
        raise HTTPException(409, "Prepare the voucher first")
    return execution_view(db, voucher, actor, roles, permissions)


@router.post("/{request_id}/lines")
def prepare_lines(
    request_id: UUID,
    payload: PaymentSchedule,
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
        return voucher_event_view(latest)
    if not latest or latest.state == "voided":
        raise HTTPException(409, "An issued, non-void voucher is required")
    summary = payment_summary(db, voucher)
    total = sum((line.amount for line in payload.lines), Decimal(0))
    if total > Decimal(summary["available"]):
        raise HTTPException(409, "Payment line amounts exceed the voucher's available payable balance")
    recovered_unallocated = sum(
        (
            row.amount
            for row in db.scalars(select(PaymentInstruction).where(PaymentInstruction.voucher_id == voucher.id))
            if line_state(db, row)[0] == "reversed"
            and not db.scalar(select(PaymentInstruction.id).where(PaymentInstruction.predecessor_id == row.id))
        ),
        Decimal(0),
    )
    if (
        sum((line.amount for line in payload.lines if not line.predecessor_id), Decimal(0))
        > Decimal(summary["available"]) - recovered_unallocated
    ):
        raise HTTPException(409, "Use a linked replacement for each recovered payment line")
    currency = db.get(Currency, item.currency_code)
    if not currency or not currency.is_active:
        raise HTTPException(409, "Payment currency must be active")
    quantum = Decimal(1).scaleb(-currency.decimal_precision)
    issuer = db.scalar(
        select(FinanceVoucherEvent).where(
            FinanceVoucherEvent.voucher_id == voucher.id, FinanceVoucherEvent.state == "issued"
        )
    )
    excluded = {
        actor.id,
        item.requestor_id,
        voucher.actor_user_id,
        issuer.actor_user_id,
        latest_journal(db, item.id).actor_user_id,
    }
    eligible = {user.id: user for user in signatory_users(db, excluded)}
    sequence = (
        db.scalar(select(func.max(PaymentInstruction.sequence)).where(PaymentInstruction.voucher_id == voucher.id)) or 0
    )
    created = []
    for line in payload.lines:
        if not line.label.strip() or line.amount != line.amount.quantize(quantum):
            raise HTTPException(422, "Payment descriptions and amounts in the currency precision are required")
        method = db.get(PaymentMethod, line.method_id)
        if not effective(method, finance_date()) or method.category not in {"cash", "check", "bank_transfer"}:
            raise HTTPException(422, "Select an active, effective payment method")
        signatory = eligible.get(line.signatory_user_id)
        if not signatory:
            raise HTTPException(422, "Select an eligible independent Authorized Signatory")
        if line.predecessor_id:
            predecessor = db.get(PaymentInstruction, line.predecessor_id)
            if (
                not predecessor
                or predecessor.voucher_id != voucher.id
                or line_state(db, predecessor)[0] not in {"failed", "voided", "reversed"}
                or predecessor.amount != line.amount
                or db.scalar(select(PaymentInstruction.id).where(PaymentInstruction.predecessor_id == predecessor.id))
            ):
                raise HTTPException(409, "Replace one failed, voided or recovered payment with the same amount")
        sequence += 1
        details = {
            "label": line.label.strip(),
            "payee": voucher.result["payee"],
            "amount": str(line.amount),
            "currency": item.currency_code,
            "method": method.name,
            "method_id": str(method.id),
            "method_category": method.category,
            "reference": line.reference,
            "sequence": sequence,
            "signatory_user_id": str(signatory.id),
            "signatory": signatory.display_name,
            "prepared_by": actor.display_name,
            "voucher_number": issuer.voucher_number,
            "predecessor_id": str(line.predecessor_id) if line.predecessor_id else None,
        }
        instruction = PaymentInstruction(
            voucher_id=voucher.id,
            request_id=item.id,
            sequence=sequence,
            method_id=method.id,
            signatory_user_id=signatory.id,
            preparer_user_id=actor.id,
            reference=line.reference,
            amount=line.amount,
            currency_code=item.currency_code,
            predecessor_id=line.predecessor_id,
            result=details,
        )
        db.add(instruction)
        try:
            db.flush()
        except IntegrityError as error:
            db.rollback()
            raise HTTPException(409, "A payment reference or replacement is already recorded") from error
        event_payload = VoucherCommand(request_version=item.version, version=0, reason=payload.reason)
        save_line_event(
            db,
            request,
            actor,
            instruction,
            event_payload,
            hashlib.sha256(f"schedule:{idempotency_key}".encode()).hexdigest(),
            "prepared",
            details,
        )
        created.append(str(instruction.id))
    return record_event(
        db,
        request,
        actor,
        item,
        voucher,
        payload,
        idempotency_key,
        "payment_prepared",
        {"voucher_number": issuer.voucher_number, "payment_line_ids": created, "payment_authorization": "pending"},
    )


def action_context(db, request, actor, request_id, instruction_id):
    item, voucher, roles, permissions = context(db, request, actor, request_id, lock=True)
    instruction = db.get(PaymentInstruction, instruction_id)
    if not voucher or not instruction or instruction.voucher_id != voucher.id:
        raise HTTPException(404, "Payment line not found")
    latest = latest_voucher_event(db, voucher.id)
    if not latest:
        raise HTTPException(409, "Issue the voucher first")
    return item, voucher, instruction, roles, permissions, latest


def validate_source(db, item, voucher):
    journal = latest_journal(db, item.id)
    tax = latest_snapshot(db, item.id)
    instance = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == item.id))
    if (
        not instance
        or instance.state != "approved"
        or not journal
        or journal.state != "posted"
        or journal.id != voucher.journal_id
        or journal.request_version != item.version
        or not tax
        or tax.id != journal.tax_snapshot_id
    ):
        raise HTTPException(409, "Final approval and original posted voucher accounting are required")


def recovery_allowed(db, item):
    blocker = recovery_blocker(db, item)
    if blocker:
        raise HTTPException(409, blocker)


@router.post("/{request_id}/lines/{instruction_id}/{action}")
def payment_action(
    request_id: UUID,
    instruction_id: UUID,
    action: Literal[
        "authorize",
        "pickup-ready",
        "release",
        "clear",
        "fail",
        "void",
        "recover",
        "confirm-reversal",
        "reject-recovery",
    ],
    payload: PaymentAction,
    request: Request,
    idempotency_key: str = Header(min_length=1, max_length=100),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    item, voucher, instruction, roles, permissions, latest = action_context(
        db, request, actor, request_id, instruction_id
    )
    policy = {
        "authorize": ("authorized_signatory", "payments.authorize", "authorized"),
        "pickup-ready": ("finance_associate", "payments.release", "ready_for_pickup"),
        "release": ("finance_associate", "payments.release", "released"),
        "clear": ("finance_manager", "payments.clear", "cleared"),
        "fail": ("finance_manager", "payments.exceptions", "failed"),
        "void": ("finance_manager", "payments.exceptions", "voided"),
        "recover": ("finance_associate", "payments.release", "recovery_pending"),
        "confirm-reversal": ("finance_manager", "payments.exceptions", "reversed"),
        "reject-recovery": ("finance_manager", "payments.exceptions", "recovery_rejected"),
    }
    role, permission, target = policy[action]
    if role not in roles or permission not in permissions or actor.id == item.requestor_id:
        raise HTTPException(403, f"Permission required: {permission}")
    if action == "authorize" and (
        instruction.signatory_user_id != actor.id
        or actor.id in {instruction.preparer_user_id, voucher.actor_user_id, latest_journal(db, item.id).actor_user_id}
    ):
        raise HTTPException(403, "Only the assigned independent signatory may authorize this payment line")
    previous = db.scalar(
        select(PaymentLineEvent).where(
            PaymentLineEvent.instruction_id == instruction.id, PaymentLineEvent.command_key == idempotency_key
        )
    )
    if previous:
        if previous.payload_hash != digest(payload, target) or previous.actor_user_id != actor.id:
            raise HTTPException(409, "Idempotency key was used for another payment action")
        return event_view(previous)
    state, version = line_state(db, instruction)
    if (
        item.status != "submitted"
        or latest.state == "voided"
        or payload.request_version != item.version
        or payload.version != version
    ):
        raise HTTPException(409, "Payment line or voucher changed; reload before continuing")
    if not payload.reason.strip():
        raise HTTPException(422, "A reason is required")
    validate_source(db, item, voucher)
    method = db.get(PaymentMethod, instruction.method_id)
    if action in {"authorize", "pickup-ready", "release"} and not effective(method, finance_date()):
        raise HTTPException(409, "Payment method is no longer active")
    if action in {"authorize", "pickup-ready", "release"} and (
        method.category not in {"cash", "check", "bank_transfer"}
        or instruction.result.get("method_category", method.category) != method.category
    ):
        raise HTTPException(409, "Payment method changed; prepare a replacement payment")
    allowed = {
        "authorize": state == "prepared",
        "pickup-ready": state == "authorized" and method.category == "check",
        "release": state == ("ready_for_pickup" if method.category == "check" else "authorized"),
        "clear": state == "released",
        "fail": state in {"prepared", "authorized", "ready_for_pickup"},
        "void": state in {"prepared", "authorized", "ready_for_pickup"},
        "recover": state in {"released", "cleared"},
        "confirm-reversal": state == "recovery_pending",
        "reject-recovery": state == "recovery_pending",
    }
    if not allowed[action]:
        raise HTTPException(409, f"Cannot {action} a payment line from {state}")
    recorded_on = payload.recorded_on or finance_date()
    if recorded_on > finance_date():
        raise HTTPException(422, "The recorded date cannot be in the future")
    result = {"instruction": instruction.result, "recorded_on": recorded_on.isoformat()}
    if action in {"recover", "confirm-reversal", "reject-recovery"}:
        recovery_allowed(db, item)
        prior = db.scalar(
            select(PaymentLineEvent)
            .where(PaymentLineEvent.instruction_id == instruction.id)
            .order_by(PaymentLineEvent.version.desc())
            .limit(1)
        )
        if action == "recover":
            evidence = db.get(PaymentEvidence, payload.evidence_id) if payload.evidence_id else None
            if payload.recovered_amount != instruction.amount:
                raise HTTPException(422, "Recover the full payment line amount in the original currency")
            if (
                not evidence
                or evidence.instruction_id != instruction.id
                or evidence.kind != "recovery"
                or not evidence_view(db, evidence)["available"]
            ):
                raise HTTPException(409, "Upload available recovery evidence for this payment line first")
            if not payload.bank_name.strip() or not payload.recipient_name.strip():
                raise HTTPException(422, "Receiving bank or cash office and returned-by name are required")
            if prior and recorded_on < date.fromisoformat(prior.result.get("recorded_on", recorded_on.isoformat())):
                raise HTTPException(422, "Recovery cannot be dated before the payment's release or clearing")
            result.update(
                prior_state=state,
                recovered_amount=str(instruction.amount),
                evidence=evidence_view(db, evidence),
                bank_name=payload.bank_name.strip(),
                recipient_name=payload.recipient_name.strip(),
            )
        else:
            if not prior or prior.actor_user_id == actor.id:
                raise HTTPException(403, "A different Finance Manager must review the recovery")
            evidence = db.get(PaymentEvidence, UUID(prior.result["evidence"]["id"]))
            if action == "confirm-reversal" and (not evidence or not evidence_view(db, evidence)["available"]):
                raise HTTPException(409, "Recovery evidence is no longer available")
            result = {
                **prior.result,
                "recovery_event_id": str(prior.id),
                "recovery_rejected": action == "reject-recovery",
            }
            if action == "reject-recovery":
                target = prior.result["prior_state"]
    if action in {"release", "clear"}:
        evidence = db.get(PaymentEvidence, payload.evidence_id) if payload.evidence_id else None
        kind = "release" if action == "release" else "clearing"
        if (
            not evidence
            or evidence.instruction_id != instruction.id
            or evidence.kind != kind
            or not evidence_view(db, evidence)["available"]
        ):
            raise HTTPException(409, f"Upload available {kind} evidence for this payment line first")
        result["evidence"] = evidence_view(db, evidence)
        if action == "release":
            if not payload.bank_name.strip() or not payload.recipient_name.strip():
                raise HTTPException(422, "Releasing bank and recipient are required")
            summary = payment_summary(db, voucher)
            if Decimal(summary["released"]) + instruction.amount > Decimal(summary["due"]):
                raise HTTPException(409, "Release would exceed the voucher payable amount")
            result.update(bank_name=payload.bank_name.strip(), recipient_name=payload.recipient_name.strip())
        else:
            release = db.scalar(
                select(PaymentLineEvent).where(
                    PaymentLineEvent.instruction_id == instruction.id, PaymentLineEvent.state == "released"
                )
            )
            if release and recorded_on < date.fromisoformat(release.result["recorded_on"]):
                raise HTTPException(422, "Clearing cannot be dated before release")
    row = save_line_event(
        db,
        request,
        actor,
        instruction,
        payload,
        idempotency_key,
        target,
        result,
        "recovery_rejected" if action == "reject-recovery" else None,
    )
    db.commit()
    return event_view(row)


@router.post("/{request_id}/lines/{instruction_id}/evidence/upload")
def upload_evidence(
    request_id: UUID,
    instruction_id: UUID,
    request: Request,
    kind: Literal["release", "clearing", "recovery"] = Form(...),
    file: UploadFile = File(...),
    idempotency_key: str = Header(min_length=1, max_length=100),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    item, voucher, instruction, roles, permissions, latest = action_context(
        db, request, actor, request_id, instruction_id
    )
    role, permission = (
        ("finance_associate", "payments.release")
        if kind in {"release", "recovery"}
        else ("finance_manager", "payments.clear")
    )
    if role not in roles or permission not in permissions or actor.id == item.requestor_id:
        raise HTTPException(403, f"Permission required: {permission}")
    filename, media_type, byte_size, checksum, spool = _prepare(file)
    spool.close()
    file.file.seek(0)
    signature = hashlib.sha256(
        json.dumps(
            {"filename": filename, "type": media_type, "size": byte_size, "sha256": checksum, "kind": kind},
            sort_keys=True,
        ).encode()
    ).hexdigest()
    previous = db.scalar(
        select(PaymentEvidence).where(
            PaymentEvidence.instruction_id == instruction.id, PaymentEvidence.command_key == idempotency_key
        )
    )
    if previous:
        if previous.payload_hash != signature or previous.actor_user_id != actor.id:
            raise HTTPException(409, "Idempotency key was used for different evidence")
        return evidence_view(db, previous)
    state, _ = line_state(db, instruction)
    if (
        item.status != "submitted"
        or latest.state == "voided"
        or not (
            {
                "release": state in {"authorized", "ready_for_pickup"},
                "clearing": state == "released",
                "recovery": state in {"released", "cleared"},
            }[kind]
        )
    ):
        raise HTTPException(409, "Evidence upload is not available at this payment stage")
    if kind == "recovery":
        recovery_allowed(db, item)
    document = Document(request_id=item.id, owner_user_id=actor.id)
    db.add(document)
    db.flush()
    validate_source(db, item, voucher)
    version = _store_version(db, request, actor, document, 1, file, commit=False)
    evidence = PaymentEvidence(
        instruction_id=instruction.id,
        document_version_id=version.id,
        kind=kind,
        command_key=idempotency_key,
        payload_hash=signature,
        actor_user_id=actor.id,
    )
    db.add(evidence)
    db.add(
        DocumentReviewDecision(
            document_id=document.id,
            decision="accepted",
            actor_user_id=actor.id,
            comment=f"Recorded {kind} payment evidence",
        )
    )
    db.flush()
    audit(
        db,
        actor_id=actor.id,
        action="payment.evidence_uploaded",
        entity_type="payment_instruction",
        entity_id=instruction.id,
        request_id=request.state.request_id,
        after=evidence_view(db, evidence),
    )
    try:
        db.commit()
    except Exception:
        db.rollback()
        get_storage().delete(version.object_key, version.storage_version_id)
        raise
    return evidence_view(db, evidence)
