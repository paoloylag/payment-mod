"""Finance preparation, immutable posting and voucher draft snapshots."""

import hashlib
import json
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..advance_settlement import validate_liquidation_posting
from ..audit import audit
from ..database import get_db
from ..finance_accounting import build_entries, latest_journal, validate_saved_entries
from ..finance_readiness import effective, finance_date
from ..finance_tax import latest_snapshot
from ..finance_validation import validation_summary
from ..models import ChartAccount, FinanceJournalSnapshot, FinanceVoucherDraft, PaymentRequest, User, WorkflowInstance
from ..security import current_user
from .conversation import participant
from .finance_tax import editable
from .workflow import actor_roles

router = APIRouter(prefix="/api/v1/finance-accounting", tags=["finance accounting"])


class JournalCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_version: int = Field(ge=1)
    version: int = Field(ge=0)
    tax_version: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=4000)


class JournalPreparation(JournalCommand):
    account_overrides: dict[str, UUID] = Field(default_factory=dict, max_length=1000)


def serialized(row):
    return {
        "id": str(row.id),
        "result": row.result,
        "reason": row.reason,
        "actor_user_id": str(row.actor_user_id),
        "created_at": row.created_at.isoformat(),
        **(
            {"version": row.version, "request_version": row.request_version, "state": row.state}
            if isinstance(row, FinanceJournalSnapshot)
            else {"state": "prepared"}
        ),
    }


def context(db, request, actor, request_id, lock=False):
    query = select(PaymentRequest).where(PaymentRequest.id == request_id)
    item = db.scalar(query.with_for_update() if lock else query)
    roles = actor_roles(db, actor)
    if (
        item is None
        or not participant(db, request, actor, item)
        or not roles.intersection({"finance_associate", "finance_manager"})
    ):
        raise HTTPException(404, "Finance request not found")
    query = select(WorkflowInstance).where(WorkflowInstance.request_id == item.id)
    instance = db.scalar(query.with_for_update() if lock else query)
    return item, instance, roles


def can_prepare(db, request, actor, item, instance, roles):
    return (
        actor.id != item.requestor_id
        and "finance_associate" in roles
        and item.status == "submitted"
        and bool(instance)
        and (instance.state == "approved" or editable(db, request, actor, item, instance))
    )


def signature(payload, action):
    return hashlib.sha256(
        json.dumps({"action": action, **payload.model_dump(mode="json")}, sort_keys=True).encode()
    ).hexdigest()


def replay(row, digest, actor):
    if row.payload_hash != digest or row.actor_user_id != actor.id:
        raise HTTPException(409, "Idempotency key was already used for a different accounting action")
    return serialized(row)


def current_sources(db, item, payload):
    tax, journal = latest_snapshot(db, item.id), latest_journal(db, item.id)
    if journal and journal.state in {"posted", "reversed"}:
        raise HTTPException(
            409, "Posted or reversed accounting cannot be changed; create a new request for a replacement"
        )
    if (
        item.version != payload.request_version
        or (journal.version if journal else 0) != payload.version
        or not tax
        or tax.request_version != item.version
        or tax.version != payload.tax_version
    ):
        raise HTTPException(409, "Request, tax calculation or accounting changed; reload before continuing")
    if not payload.reason.strip():
        raise HTTPException(422, "A reason is required")
    return tax, journal


def save_snapshot(db, item, tax, payload, key, digest, actor, result, state, request):
    previous = latest_journal(db, item.id)
    result = {**result, "prepared_by" if state == "draft" else "posted_by": actor.display_name}
    row = FinanceJournalSnapshot(
        request_id=item.id,
        request_version=item.version,
        tax_snapshot_id=tax.id,
        version=payload.version + 1,
        state=state,
        command_key=key,
        payload_hash=digest,
        result=result,
        reason=payload.reason.strip(),
        actor_user_id=actor.id,
    )
    db.add(row)
    db.flush()
    audit(
        db,
        actor_id=actor.id,
        action=f"finance.accounting_{state}",
        entity_type="payment_request",
        entity_id=item.id,
        request_id=request.state.request_id,
        before=serialized(previous) if previous else None,
        after=serialized(row),
    )
    db.commit()
    return serialized(row)


@router.get("/{request_id}")
def get_accounting(
    request_id: UUID, request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)
):
    item, instance, roles = context(db, request, actor, request_id)
    tax, journal = latest_snapshot(db, item.id), latest_journal(db, item.id)
    stale = bool(journal and (journal.request_version != item.version or not tax or journal.tax_snapshot_id != tax.id))
    preview, blocker = None, None
    if not journal or stale:
        try:
            preview = build_entries(db, item, tax)
        except HTTPException as error:
            blocker = error.detail
    posted = bool(journal and journal.state == "posted")
    voucher = db.scalar(select(FinanceVoucherDraft).where(FinanceVoucherDraft.request_id == item.id))
    return {
        "request_version": item.version,
        "tax_version": tax.version if tax else 0,
        "version": journal.version if journal else 0,
        "saved": serialized(journal) if journal else None,
        "stale": stale,
        "preview": preview,
        "blocker": blocker,
        "can_prepare": not posted
        and not (journal and journal.state == "reversed")
        and can_prepare(db, request, actor, item, instance, roles),
        "can_post": bool(
            not posted
            and journal
            and journal.state == "draft"
            and not stale
            and instance
            and instance.state == "approved"
            and item.status == "submitted"
            and actor.id != item.requestor_id
            and "finance_manager" in roles
        ),
        "can_prepare_voucher": bool(
            posted
            and not voucher
            and instance
            and instance.state == "approved"
            and item.status == "submitted"
            and actor.id != item.requestor_id
            and "finance_associate" in roles
        ),
        "voucher": serialized(voucher) if voucher else None,
        "accounts": [
            {"id": str(account.id), "code": account.code, "name": account.name}
            for account in db.scalars(select(ChartAccount).order_by(ChartAccount.code))
            if effective(account, finance_date()) and account.is_posting
        ],
        "history": [
            serialized(row)
            for row in db.scalars(
                select(FinanceJournalSnapshot)
                .where(FinanceJournalSnapshot.request_id == item.id)
                .order_by(FinanceJournalSnapshot.version.desc())
            )
        ],
    }


@router.post("/{request_id}/draft")
def prepare(
    request_id: UUID,
    payload: JournalPreparation,
    request: Request,
    idempotency_key: str = Header(min_length=1, max_length=100),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    item, instance, roles = context(db, request, actor, request_id, lock=True)
    if "finance_associate" not in roles or actor.id == item.requestor_id:
        raise HTTPException(403, "Only Finance Associate may prepare or correct accounting drafts")
    digest = signature(payload, "draft")
    previous = db.scalar(
        select(FinanceJournalSnapshot).where(
            FinanceJournalSnapshot.request_id == item.id, FinanceJournalSnapshot.command_key == idempotency_key
        )
    )
    if previous:
        return replay(previous, digest, actor)
    if not can_prepare(db, request, actor, item, instance, roles):
        raise HTTPException(403, "Prepare accounting during Finance Associate review or after final approval")
    tax, _ = current_sources(db, item, payload)
    result = build_entries(db, item, tax, payload.account_overrides, strict=True)
    return save_snapshot(db, item, tax, payload, idempotency_key, digest, actor, result, "draft", request)


@router.post("/{request_id}/post")
def post(
    request_id: UUID,
    payload: JournalCommand,
    request: Request,
    idempotency_key: str = Header(min_length=1, max_length=100),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    item, instance, roles = context(db, request, actor, request_id, lock=True)
    if "finance_manager" not in roles or actor.id == item.requestor_id:
        raise HTTPException(403, "Only Finance Manager may post accounting")
    digest = signature(payload, "post")
    previous = db.scalar(
        select(FinanceJournalSnapshot).where(
            FinanceJournalSnapshot.request_id == item.id, FinanceJournalSnapshot.command_key == idempotency_key
        )
    )
    if previous:
        return replay(previous, digest, actor)
    tax, journal = current_sources(db, item, payload)
    if not instance or instance.state != "approved" or item.status != "submitted":
        raise HTTPException(409, "Final request approval is required before accounting posting")
    if not journal or journal.state != "draft":
        raise HTTPException(409, "Finance Associate must save an accounting draft first")
    validation = validation_summary(db, item)
    if not validation["ready_to_approve"]:
        raise HTTPException(409, "Finance validation is incomplete: " + "; ".join(validation["blockers"]))
    validate_liquidation_posting(db, item, tax)
    validate_saved_entries(db, journal.result)
    if Decimal(journal.result["totals"]["debit"]) != item.gross_amount:
        raise HTTPException(409, "Accounting no longer reconciles to the request amount")
    return save_snapshot(db, item, tax, payload, idempotency_key, digest, actor, journal.result, "posted", request)


@router.post("/{request_id}/voucher")
def prepare_voucher(
    request_id: UUID,
    payload: JournalCommand,
    request: Request,
    idempotency_key: str = Header(min_length=1, max_length=100),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    item, instance, roles = context(db, request, actor, request_id, lock=True)
    if "finance_associate" not in roles or actor.id == item.requestor_id:
        raise HTTPException(403, "Only Finance Associate may prepare the voucher draft")
    digest = signature(payload, "voucher")
    previous = db.scalar(select(FinanceVoucherDraft).where(FinanceVoucherDraft.request_id == item.id))
    if previous:
        if previous.command_key != idempotency_key:
            raise HTTPException(409, "A voucher draft is already prepared for this request")
        return replay(previous, digest, actor)
    journal, tax = latest_journal(db, item.id), latest_snapshot(db, item.id)
    if (
        not instance
        or instance.state != "approved"
        or item.status != "submitted"
        or not journal
        or journal.state != "posted"
    ):
        raise HTTPException(409, "Final approval and posted accounting are required before voucher preparation")
    if (
        item.version != payload.request_version
        or journal.version != payload.version
        or not tax
        or tax.version != payload.tax_version
        or journal.tax_snapshot_id != tax.id
        or journal.request_version != item.version
    ):
        raise HTTPException(409, "Request or posted accounting changed; reload before preparing the voucher")
    if not payload.reason.strip():
        raise HTTPException(422, "A preparation reason is required")
    row = FinanceVoucherDraft(
        request_id=item.id,
        journal_id=journal.id,
        command_key=idempotency_key,
        payload_hash=digest,
        actor_user_id=actor.id,
        reason=payload.reason.strip(),
        result={
            "request_number": item.request_number,
            "reserved_voucher_number": item.voucher_number,
            "payee": item.payee_name,
            "purpose": item.purpose,
            "currency": item.currency_code,
            "journal_version": journal.version,
            "request_version": item.version,
            "tax_version": tax.version,
            "entries": journal.result["entries"],
            "totals": journal.result["tax_totals"],
            "request_type": item.request_type,
            "advance_source": tax.result.get("advance_source"),
            "prepared_by": actor.display_name,
            "certification_text": tax.result["configuration"].get("voucher", {}).get("certification_text", ""),
            "status": "draft",
            "payment_authorization": "pending",
        },
    )
    db.add(row)
    db.flush()
    audit(
        db,
        actor_id=actor.id,
        action="finance.voucher_prepared",
        entity_type="payment_request",
        entity_id=item.id,
        request_id=request.state.request_id,
        after=serialized(row),
    )
    db.commit()
    return serialized(row)
