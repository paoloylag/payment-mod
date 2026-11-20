"""Authenticated Procurement receipt inbox; receipt gates release, never approval."""

import hashlib
import hmac
import time
from datetime import datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import DateTime, Integer, String, UniqueConstraint, func, select, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Mapped, Session, mapped_column

from .config import get_settings
from .database import Base, get_db


class ProcurementReceiptEvent(Base):
    __tablename__ = "procurement_receipt_events"
    __table_args__ = (
        UniqueConstraint("po_id", "po_version", name="uq_procurement_receipt_version"),
    )
    event_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    po_id: Mapped[str] = mapped_column(String(100), index=True)
    po_version: Mapped[int] = mapped_column(Integer)
    body_hash: Mapped[str] = mapped_column(String(64))
    body: Mapped[dict] = mapped_column(JSONB)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ReceiptItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    itemId: str = Field(min_length=1, max_length=100)
    ordered: Decimal = Field(gt=0, max_digits=18, decimal_places=4)
    accepted: Decimal = Field(ge=0, max_digits=18, decimal_places=4)
    rejected: Decimal = Field(ge=0, max_digits=18, decimal_places=4)


class ReceiptConfirmation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    eventId: str = Field(min_length=1, max_length=100)
    type: Literal["po.receipt_confirmed"]
    schemaVersion: Literal[1]
    occurredAt: datetime
    poId: str = Field(min_length=1, max_length=100)
    poNumber: str = Field(min_length=1, max_length=80)
    poVersion: int = Field(gt=0, le=2147483647, strict=True)
    sourceRequestId: str = Field(min_length=1, max_length=100)
    requesterId: str = Field(min_length=1, max_length=100)
    confirmedById: str = Field(min_length=1, max_length=100)
    confirmedByName: str = Field(min_length=1, max_length=160)
    confirmedAt: datetime
    fullyReceived: Literal[True]
    receiptIds: list[str] = Field(min_length=1, max_length=50)
    invoiceDocumentIds: list[str] = Field(min_length=1, max_length=50)
    items: list[ReceiptItem] = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def original_requester_only(self):
        if self.requesterId != self.confirmedById:
            raise ValueError("The original Procurement requestor must confirm receipt")
        if any(item.accepted != item.ordered for item in self.items):
            raise ValueError("All ordered goods must be accepted")
        if len({item.itemId for item in self.items}) != len(self.items):
            raise ValueError("Receipt item IDs must be unique")
        for value in (self.occurredAt, self.confirmedAt):
            if value.tzinfo is None or value.timestamp() > time.time() + 300:
                raise ValueError(
                    "Confirmation timestamps must include a timezone and cannot be in the future"
                )
        return self


def receipt_gate(db, item):
    if item.request_type != "poPayment":
        return {"required": False, "confirmed": True}
    pending = {
        "required": True,
        "confirmed": False,
        "message": "Awaiting requestor receipt confirmation",
    }
    po = (
        (item.type_data or {}).get("procurement_snapshot", {}).get("purchase_order", {})
    )
    if not all(
        po.get(key) for key in ("id", "poNumber", "sourceRequestId", "requesterId")
    ):
        return {
            **pending,
            "detail": "Procurement PO/requestor mapping is required before release.",
        }
    event = db.scalar(
        select(ProcurementReceiptEvent)
        .where(ProcurementReceiptEvent.po_id == str(po["id"]))
        .order_by(ProcurementReceiptEvent.po_version.desc())
        .limit(1)
    )
    if not event:
        return pending
    body = event.body
    if (
        body["poNumber"] != str(po["poNumber"])
        or body["sourceRequestId"] != str(po["sourceRequestId"])
        or body["requesterId"] != str(po["requesterId"])
        or body["confirmedById"] != str(po["requesterId"])
        or event.po_version < int(po.get("version") or 0)
    ):
        return {
            **pending,
            "detail": "Receipt confirmation does not match the approved Procurement PO snapshot.",
        }
    source_items = po.get("items") or []
    if source_items and all(row.get("id") for row in source_items):
        received = {
            row["itemId"]: Decimal(str(row["accepted"])) for row in body["items"]
        }
        expected = {
            str(row["id"]): Decimal(str(row["quantity"])) for row in source_items
        }
        if received != expected:
            return {
                **pending,
                "detail": "Confirmed quantities do not match the approved PO items.",
            }
    return {
        "required": True,
        "confirmed": True,
        "message": "Receipt confirmed by original requestor",
        "confirmed_by": body["confirmedByName"],
        "confirmed_at": body["confirmedAt"],
        "event_id": event.event_id,
    }


def require_po_receipt(db, item):
    gate = receipt_gate(db, item)
    if not gate["confirmed"]:
        raise HTTPException(409, gate["message"])


router = APIRouter(
    prefix="/api/v1/integrations/procurement", tags=["Procurement receipt integration"]
)


@router.post("/receipts")
async def receive_receipt(request: Request, db: Session = Depends(get_db)):
    secret = get_settings().procurement_receipt_secret
    if not secret or len(secret.get_secret_value()) < 32:
        raise HTTPException(503, "Procurement receipt integration is not configured")
    stamp = request.headers.get("X-Procurement-Timestamp", "")
    signature = request.headers.get("X-Procurement-Signature", "")
    if len(stamp) > 12 or not stamp.isdigit() or abs(time.time() - int(stamp)) > 300:
        raise HTTPException(401, "Invalid Procurement event authentication")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 65536:
            raise HTTPException(413, "Procurement receipt event is too large")
    expected = hmac.new(
        secret.get_secret_value().encode(), stamp.encode() + b"." + body, hashlib.sha256
    ).hexdigest()
    if (
        len(signature) != 64
        or any(c not in "0123456789abcdef" for c in signature)
        or not hmac.compare_digest(expected, signature)
    ):
        raise HTTPException(401, "Invalid Procurement event authentication")
    try:
        event = ReceiptConfirmation.model_validate_json(bytes(body))
    except ValueError:
        raise HTTPException(422, "Invalid original-requestor receipt confirmation") from None
    digest = hashlib.sha256(body).hexdigest()
    # Serializes concurrent deliveries; immutable inbox history also supports receipt-before-filing.
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": "procurement-receipt:" + event.poId},
    )
    prior = db.get(ProcurementReceiptEvent, event.eventId)
    if prior:
        if prior.body_hash != digest:
            raise HTTPException(
                409, "Procurement event ID was reused with different content"
            )
        return {"eventId": event.eventId, "accepted": True, "duplicate": True}
    version = db.scalar(
        select(ProcurementReceiptEvent).where(
            ProcurementReceiptEvent.po_id == event.poId,
            ProcurementReceiptEvent.po_version == event.poVersion,
        )
    )
    if version:
        raise HTTPException(
            409, "This Procurement PO version already has a receipt confirmation"
        )
    latest = db.scalar(
        select(func.max(ProcurementReceiptEvent.po_version)).where(
            ProcurementReceiptEvent.po_id == event.poId
        )
    )
    if latest is not None and event.poVersion < latest:
        raise HTTPException(409, "Stale Procurement receipt version")
    db.add(
        ProcurementReceiptEvent(
            event_id=event.eventId,
            po_id=event.poId,
            po_version=event.poVersion,
            body_hash=digest,
            body=event.model_dump(mode="json"),
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Procurement receipt event or version already exists") from None
    return {"eventId": event.eventId, "accepted": True, "duplicate": False}
