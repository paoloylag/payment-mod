"""Full unused-advance receipts, verified by Finance Manager."""

import hashlib
import json
from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..advance_settlement import advance_source
from ..audit import audit
from ..database import get_db
from ..finance_configuration import reference as account_reference
from ..finance_readiness import effective, finance_date
from ..fund_returns import latest_return, receipt_available, return_amounts, return_view
from ..models import (
    ChartAccount,
    Document,
    DocumentReviewDecision,
    FundReturnEvent,
    PaymentInstruction,
    PaymentLineEvent,
    User,
)
from ..security import current_user
from ..voucher_service import latest_voucher_event
from .documents import _prepare, _store_version, get_storage
from .finance_vouchers import VoucherCommand, context, digest
from .payment_execution import validate_source

router = APIRouter(prefix="/api/v1/payments", tags=["fund returns"])


def return_context(db, request, actor, request_id, role, permission):
    item, voucher, roles, permissions = context(db, request, actor, request_id, lock=True)
    if role not in roles or permission not in permissions or actor.id == item.requestor_id:
        raise HTTPException(403, f"Permission required: {permission} for {role}")
    event = latest_voucher_event(db, voucher.id) if voucher else None
    if (
        not voucher
        or not event
        or event.state == "voided"
        or item.request_type != "liquidation"
        or item.status != "submitted"
    ):
        raise HTTPException(409, "An issued Liquidation voucher is required")
    validate_source(db, item, voucher)
    source = advance_source(db, item, lock=True)
    if source != voucher.result.get("advance_source"):
        raise HTTPException(409, "The source advance changed")
    if Decimal(return_amounts(voucher, None)["expected"]) <= 0:
        raise HTTPException(409, "This Liquidation has no unused advance to return")
    return item, voucher, latest_return(db, voucher.id)


def record(db, request, actor, voucher, version, key, signature, state, amount, reason, result):
    row = FundReturnEvent(
        voucher_id=voucher.id,
        version=version + 1,
        state=state,
        amount=amount,
        command_key=key,
        payload_hash=signature,
        reason=reason.strip(),
        result={**result, "actor_name": actor.display_name},
        actor_user_id=actor.id,
    )
    db.add(row)
    db.flush()
    audit(
        db,
        actor_id=actor.id,
        action=f"fund_return.{state}",
        entity_type="finance_voucher",
        entity_id=voucher.id,
        request_id=request.state.request_id,
        after=return_view(row),
    )
    return row


def replay(db, voucher, key, signature, actor):
    row = db.scalar(
        select(FundReturnEvent).where(FundReturnEvent.voucher_id == voucher.id, FundReturnEvent.command_key == key)
    )
    if row and (row.payload_hash != signature or row.actor_user_id != actor.id):
        raise HTTPException(409, "Idempotency key was used for another fund return action")
    return row


@router.post("/{request_id}/fund-return")
def receive_return(
    request_id: UUID,
    request: Request,
    request_version: int = Form(ge=1),
    version: int = Form(ge=0),
    amount: Decimal = Form(gt=0, max_digits=19, decimal_places=4),
    recorded_on: date = Form(...),
    reference: str = Form(min_length=1, max_length=100),
    receiving_office: str = Form(min_length=1, max_length=160),
    receiving_account_id: UUID = Form(...),
    reason: str = Form(min_length=1, max_length=4000),
    file: UploadFile = File(...),
    idempotency_key: str = Header(min_length=1, max_length=100),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    item, voucher, latest = return_context(db, request, actor, request_id, "finance_associate", "payments.release")
    filename, media_type, size, checksum, spool = _prepare(file)
    spool.close()
    file.file.seek(0)
    body = {
        "request_version": request_version,
        "version": version,
        "amount": str(amount),
        "recorded_on": recorded_on.isoformat(),
        "reference": reference,
        "receiving_office": receiving_office,
        "receiving_account_id": str(receiving_account_id),
        "reason": reason,
        "filename": filename,
        "media_type": media_type,
        "size": size,
        "checksum": checksum,
    }
    signature = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
    previous = replay(db, voucher, idempotency_key, signature, actor)
    if previous:
        return return_view(previous)
    if (
        version != (latest.version if latest else 0)
        or request_version != item.version
        or (latest and latest.state != "rejected")
    ):
        raise HTTPException(409, "Fund return changed or already recorded; reload before continuing")
    if amount != Decimal(return_amounts(voucher, None)["expected"]):
        raise HTTPException(422, "Return the full unused advance balance in the original currency")
    if recorded_on > finance_date() or not all(value.strip() for value in (reference, receiving_office, reason)):
        raise HTTPException(422, "Provide receipt details, a reason and a date no later than today")
    releases = list(
        db.scalars(
            select(PaymentLineEvent)
            .join(PaymentInstruction, PaymentInstruction.id == PaymentLineEvent.instruction_id)
            .where(
                PaymentInstruction.request_id == UUID(voucher.result["advance_source"]["request_id"]),
                PaymentLineEvent.state == "released",
            )
        )
    )
    dates = [
        date.fromisoformat(row.result["recorded_on"])
        for row in releases
        if row.result.get("recorded_on") and not row.result.get("recovery_rejected")
    ]
    if dates and recorded_on < max(dates):
        raise HTTPException(422, "A fund return cannot be dated before the source advance was fully released")
    account = db.get(ChartAccount, receiving_account_id)
    if (
        not effective(account, finance_date())
        or not account.is_posting
        or account.account_type != "asset"
        or str(account.id) == voucher.result["advance_source"]["asset_account"]["id"]
    ):
        raise HTTPException(422, "Choose an active posting cash/bank asset account distinct from the advance asset")
    document = Document(request_id=item.id, owner_user_id=actor.id)
    db.add(document)
    db.flush()
    stored = _store_version(db, request, actor, document, 1, file, commit=False)
    result = {
        "document_id": str(document.id),
        "document_version_id": str(stored.id),
        "filename": filename,
        "sha256": checksum,
        "recorded_on": recorded_on.isoformat(),
        "reference": reference.strip(),
        "receiving_office": receiving_office.strip(),
        "received_by": actor.display_name,
        "received_by_id": str(actor.id),
        "advance_source": voucher.result["advance_source"],
        "currency": item.currency_code,
        "receiving_account": account_reference(account),
    }
    db.add(
        DocumentReviewDecision(
            document_id=document.id,
            decision="accepted",
            actor_user_id=actor.id,
            comment="Unused advance receipt evidence; Finance verification pending",
        )
    )
    row = record(db, request, actor, voucher, version, idempotency_key, signature, "recorded", amount, reason, result)
    try:
        db.commit()
    except Exception:
        db.rollback()
        get_storage().delete(stored.object_key, stored.storage_version_id)
        raise
    return return_view(row)


@router.post("/{request_id}/fund-return/{action}")
def verify_return(
    request_id: UUID,
    action: Literal["verify", "reject"],
    payload: VoucherCommand,
    request: Request,
    idempotency_key: str = Header(min_length=1, max_length=100),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    item, voucher, latest = return_context(db, request, actor, request_id, "finance_manager", "payments.clear")
    signature = digest(payload, f"fund-return:{action}")
    previous = replay(db, voucher, idempotency_key, signature, actor)
    if previous:
        return return_view(previous)
    if (
        not latest
        or latest.state != "recorded"
        or payload.version != latest.version
        or payload.request_version != item.version
    ):
        raise HTTPException(409, "A current receipt awaiting verification is required")
    if actor.id == latest.actor_user_id:
        raise HTTPException(403, "A different Finance Manager must verify the receipt")
    if not payload.reason.strip():
        raise HTTPException(422, "A verification or rejection reason is required")
    if action == "verify" and not receipt_available(db, latest.result):
        raise HTTPException(409, "The receipt evidence is no longer available")
    result = {**latest.result, "receipt_event_id": str(latest.id)}
    if action == "verify":
        account = db.get(ChartAccount, UUID(result["receiving_account"]["id"]))
        asset = db.get(ChartAccount, UUID(result["advance_source"]["asset_account"]["id"]))
        if not all(
            effective(row, finance_date()) and row.is_posting and row.account_type == "asset"
            for row in (account, asset)
        ):
            raise HTTPException(409, "Receipt and advance asset accounts must remain active and effective")
        result["receipt_entries"] = [
            {
                "account": result["receiving_account"],
                "debit": str(latest.amount),
                "credit": "0",
                "cost_center": result["advance_source"]["asset_cost_center"],
            },
            {
                "account": result["advance_source"]["asset_account"],
                "debit": "0",
                "credit": str(latest.amount),
                "cost_center": result["advance_source"]["asset_cost_center"],
            },
        ]
    row = record(
        db,
        request,
        actor,
        voucher,
        latest.version,
        idempotency_key,
        signature,
        "verified" if action == "verify" else "rejected",
        latest.amount,
        payload.reason,
        result,
    )
    db.commit()
    return return_view(row)
