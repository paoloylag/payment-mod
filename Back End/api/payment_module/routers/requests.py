from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from ..audit import audit
from ..database import get_db
from ..models import (
    Currency,
    Department,
    PaymentRequest,
    PaymentRequestLine,
    PaymentRequestStatusHistory,
    PaymentRequestVersion,
    RequestCommand,
    RequestSequence,
    User,
)
from ..schemas import PaymentRequestCreate, PaymentRequestUpdate, RequestTransition
from ..security import current_user

router = APIRouter(prefix="/api/v1/requests", tags=["payment requests"])


def permissions(request: Request) -> set[str]:
    return getattr(request.state, "permissions", set())


def visible_query(request: Request, actor: User):
    codes = permissions(request)
    query = select(PaymentRequest)
    if "requests.read_all" in codes:
        return query
    if "requests.read_department" in codes and actor.department_id:
        return query.where(
            or_(PaymentRequest.requestor_id == actor.id, PaymentRequest.department_id == actor.department_id)
        )
    return query.where(PaymentRequest.requestor_id == actor.id)


def get_visible(db: Session, request: Request, actor: User, request_id: UUID) -> PaymentRequest:
    item = db.scalar(visible_query(request, actor).where(PaymentRequest.id == request_id))
    if not item:
        raise HTTPException(404, "Payment request not found")
    return item


def serialize(db: Session, item: PaymentRequest) -> dict:
    lines = list(
        db.scalars(
            select(PaymentRequestLine)
            .where(PaymentRequestLine.request_id == item.id)
            .order_by(PaymentRequestLine.position)
        )
    )
    return {
        "id": str(item.id),
        "request_number": item.request_number,
        "request_type": item.request_type,
        "status": item.status,
        "requestor_id": str(item.requestor_id),
        "department_id": str(item.department_id),
        "payee_name": item.payee_name,
        "vendor_external_id": item.vendor_external_id,
        "purpose": item.purpose,
        "currency_code": item.currency_code,
        "gross_amount": float(item.gross_amount),
        "version": item.version,
        "type_data": item.type_data,
        "submitted_at": item.submitted_at.isoformat() if item.submitted_at else None,
        "created_at": item.created_at.isoformat(),
        "updated_at": item.updated_at.isoformat(),
        "lines": [
            {
                "id": str(line.id),
                "position": line.position,
                "invoice_date": line.invoice_date.isoformat() if line.invoice_date else None,
                "invoice_number": line.invoice_number,
                "vendor_name": line.vendor_name,
                "particulars": line.particulars,
                "chart_account_id": str(line.chart_account_id) if line.chart_account_id else None,
                "cost_center_id": str(line.cost_center_id) if line.cost_center_id else None,
                "amount": float(line.amount),
                "currency_code": line.currency_code,
                "attachment_refs": line.attachment_refs,
            }
            for line in lines
        ],
    }


def validate(db: Session, payload: PaymentRequestCreate) -> Decimal:
    if not db.get(Department, payload.department_id):
        raise HTTPException(422, "Department does not exist")
    currency = db.get(Currency, payload.currency_code)
    if not currency or not currency.is_active:
        raise HTTPException(422, "Currency is not active")
    if any(line.currency_code != payload.currency_code for line in payload.lines):
        raise HTTPException(422, "Mixed currencies are not allowed within one request")
    return sum((line.amount for line in payload.lines), Decimal("0"))


def replace_lines(db: Session, item: PaymentRequest, payload: PaymentRequestCreate) -> None:
    db.execute(delete(PaymentRequestLine).where(PaymentRequestLine.request_id == item.id))
    for position, line in enumerate(payload.lines, 1):
        db.add(PaymentRequestLine(request_id=item.id, position=position, **line.model_dump()))


def snapshot(db: Session, item: PaymentRequest, actor: User) -> dict:
    data = serialize(db, item)
    db.add(PaymentRequestVersion(request_id=item.id, version=item.version, actor_user_id=actor.id, snapshot=data))
    return data


@router.post("", status_code=201)
def create_payment_request(
    payload: PaymentRequestCreate, request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)
):
    if "requests.create" not in permissions(request):
        raise HTTPException(403, "Permission required: requests.create")
    total = validate(db, payload)
    item = PaymentRequest(requestor_id=actor.id, gross_amount=total, **payload.model_dump(exclude={"lines"}))
    db.add(item)
    db.flush()
    replace_lines(db, item, payload)
    db.flush()
    result = snapshot(db, item, actor)
    audit(
        db,
        actor_id=actor.id,
        action="payment_request.created",
        entity_type="payment_request",
        entity_id=item.id,
        request_id=request.state.request_id,
        after=result,
    )
    db.commit()
    return result


@router.get("")
def list_payment_requests(request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)):
    return [
        serialize(db, item)
        for item in db.scalars(visible_query(request, actor).order_by(PaymentRequest.updated_at.desc()))
    ]


@router.get("/{request_id}")
def get_payment_request(
    request_id: UUID, request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)
):
    return serialize(db, get_visible(db, request, actor, request_id))


@router.patch("/{request_id}")
def update_payment_request(
    request_id: UUID,
    payload: PaymentRequestUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    item = get_visible(db, request, actor, request_id)
    if item.requestor_id != actor.id or item.status not in {"draft", "returned"}:
        raise HTTPException(409, "Only the owner can edit a draft or returned request")
    if item.version != payload.version:
        raise HTTPException(409, "This request was updated elsewhere; reload before saving")
    total = validate(db, payload)
    for key, value in payload.model_dump(exclude={"lines", "version"}).items():
        setattr(item, key, value)
    item.gross_amount = total
    item.version += 1
    replace_lines(db, item, payload)
    db.flush()
    result = snapshot(db, item, actor)
    db.commit()
    return result


@router.delete("/{request_id}", status_code=204)
def delete_payment_request(
    request_id: UUID, request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)
):
    item = get_visible(db, request, actor, request_id)
    if item.requestor_id != actor.id or item.status != "draft":
        raise HTTPException(409, "Only the owner can delete a draft")
    db.delete(item)
    db.commit()


def next_number(db: Session) -> str:
    year = datetime.now(UTC).year
    sequence = db.get(RequestSequence, year, with_for_update=True)
    if not sequence:
        sequence = RequestSequence(year=year, last_value=0)
        db.add(sequence)
        db.flush()
    sequence.last_value += 1
    return f"PR-{year}-{sequence.last_value:06d}"


@router.post("/{request_id}/submit")
def submit_payment_request(
    request_id: UUID,
    payload: RequestTransition,
    request: Request,
    idempotency_key: str = Header(alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    existing = db.scalar(
        select(RequestCommand).where(
            RequestCommand.actor_user_id == actor.id,
            RequestCommand.action == "submit",
            RequestCommand.idempotency_key == idempotency_key,
        )
    )
    if existing:
        return existing.result
    item = get_visible(db, request, actor, request_id)
    if item.requestor_id != actor.id or item.status not in {"draft", "returned"}:
        raise HTTPException(409, "Request cannot be submitted")
    if item.version != payload.version:
        raise HTTPException(409, "This request was updated elsewhere; reload before submitting")
    line_count = db.scalar(
        select(func.count()).select_from(PaymentRequestLine).where(PaymentRequestLine.request_id == item.id)
    )
    if not line_count or item.gross_amount <= 0 or not item.purpose.strip():
        raise HTTPException(422, "Purpose and at least one positive request line are required")
    previous = item.status
    item.status = "submitted"
    item.submitted_at = datetime.now(UTC)
    item.request_number = item.request_number or next_number(db)
    item.version += 1
    db.flush()
    db.add(
        PaymentRequestStatusHistory(
            request_id=item.id, from_status=previous, to_status=item.status, actor_user_id=actor.id, note=payload.note
        )
    )
    result = snapshot(db, item, actor)
    db.add(
        RequestCommand(
            request_id=item.id, actor_user_id=actor.id, action="submit", idempotency_key=idempotency_key, result=result
        )
    )
    db.commit()
    return result


@router.post("/{request_id}/return")
def return_payment_request(
    request_id: UUID,
    payload: RequestTransition,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    if "requests.manage_lifecycle" not in permissions(request):
        raise HTTPException(403, "Permission required: requests.manage_lifecycle")
    item = get_visible(db, request, actor, request_id)
    if item.status != "submitted" or item.version != payload.version or not payload.note.strip():
        raise HTTPException(409, "Submitted request and a return note are required")
    item.status = "returned"
    item.version += 1
    db.add(
        PaymentRequestStatusHistory(
            request_id=item.id, from_status="submitted", to_status="returned", actor_user_id=actor.id, note=payload.note
        )
    )
    db.flush()
    result = snapshot(db, item, actor)
    db.commit()
    return result
