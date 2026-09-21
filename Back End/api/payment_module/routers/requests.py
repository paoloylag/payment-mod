from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from sqlalchemy import String, delete, func, or_, select, text
from sqlalchemy.orm import Session

from ..audit import audit
from ..config import get_settings
from ..database import get_db
from ..models import (
    ChartAccount,
    CostCenter,
    Currency,
    Department,
    PaymentRequest,
    PaymentRequestLine,
    PaymentRequestStatusHistory,
    PaymentRequestVersion,
    RequestCommand,
    RequestSequence,
    SystemSetting,
    User,
)
from ..schemas import PaymentRequestCreate, PaymentRequestUpdate, RequestNumberingSettingUpdate, RequestTransition
from ..security import current_user

router = APIRouter(prefix="/api/v1/requests", tags=["payment requests"])
settings_router = APIRouter(prefix="/api/v1/request-settings", tags=["payment request settings"])
NUMBERING_RESET_MONTH_KEY = "requests.numbering_reset_month"
app_settings = get_settings()


def permissions(request: Request) -> set[str]:
    return getattr(request.state, "permissions", set())


def visible_query(request: Request, actor: User):
    codes = permissions(request)
    query = select(PaymentRequest)
    if "requests.read_all" in codes:
        return query
    if "requests.read_department" in codes and actor.department_id:
        return query.where(
            or_(
                PaymentRequest.requestor_id == actor.id,
                PaymentRequest.department_id == actor.department_id,
                PaymentRequest.requestor_id.in_(select(User.id).where(User.manager_id == actor.id)),
            )
        )
    return query.where(PaymentRequest.requestor_id == actor.id)


def get_visible(
    db: Session, request: Request, actor: User, request_id: UUID, *, lock_for_update: bool = False
) -> PaymentRequest:
    query = visible_query(request, actor).where(PaymentRequest.id == request_id)
    if lock_for_update:
        query = query.with_for_update()
    item = db.scalar(query)
    if not item:
        raise HTTPException(404, "Payment request not found")
    return item


def serialize(
    db: Session,
    item: PaymentRequest,
    *,
    requestors: dict[UUID, User] | None = None,
    departments: dict[UUID, Department] | None = None,
    lines_by_request: dict[UUID, list[PaymentRequestLine]] | None = None,
) -> dict:
    requestor = requestors.get(item.requestor_id) if requestors is not None else db.get(User, item.requestor_id)
    department = (
        departments.get(item.department_id)
        if departments is not None
        else db.get(Department, item.department_id)
    )
    lines = (
        lines_by_request.get(item.id, [])
        if lines_by_request is not None
        else list(
            db.scalars(
                select(PaymentRequestLine)
                .where(PaymentRequestLine.request_id == item.id)
                .order_by(PaymentRequestLine.position)
            )
        )
    )
    draft_expires_at = item.updated_at + timedelta(days=app_settings.draft_retention_days)
    warning_at = draft_expires_at - timedelta(days=app_settings.draft_warning_days)
    return {
        "id": str(item.id),
        "request_number": item.request_number,
        "request_type": item.request_type,
        "status": item.status,
        "requestor_id": str(item.requestor_id),
        "requestor_name": requestor.display_name if requestor else "Unknown requestor",
        "department_id": str(item.department_id),
        "department_name": department.name if department else "Unknown department",
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
        "draft_expires_at": draft_expires_at.isoformat() if item.status == "draft" else None,
        "draft_retention_warning": item.status == "draft" and datetime.now(UTC) >= warning_at,
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


def serialize_many(db: Session, items: list[PaymentRequest]) -> list[dict]:
    if not items:
        return []
    requestor_ids = {item.requestor_id for item in items}
    department_ids = {item.department_id for item in items}
    request_ids = {item.id for item in items}
    requestors = {item.id: item for item in db.scalars(select(User).where(User.id.in_(requestor_ids)))}
    departments = {item.id: item for item in db.scalars(select(Department).where(Department.id.in_(department_ids)))}
    lines_by_request: dict[UUID, list[PaymentRequestLine]] = {request_id: [] for request_id in request_ids}
    for line in db.scalars(
        select(PaymentRequestLine)
        .where(PaymentRequestLine.request_id.in_(request_ids))
        .order_by(PaymentRequestLine.request_id, PaymentRequestLine.position)
    ):
        lines_by_request[line.request_id].append(line)
    return [
        serialize(
            db,
            item,
            requestors=requestors,
            departments=departments,
            lines_by_request=lines_by_request,
        )
        for item in items
    ]


def validate(db: Session, payload: PaymentRequestCreate) -> Decimal:
    if not db.get(Department, payload.department_id):
        raise HTTPException(422, "Department does not exist")
    currency = db.get(Currency, payload.currency_code)
    if not currency or not currency.is_active:
        raise HTTPException(422, "Currency is not active")
    if any(line.currency_code != payload.currency_code for line in payload.lines):
        raise HTTPException(422, "Mixed currencies are not allowed within one request")
    for index, line in enumerate(payload.lines, 1):
        if line.chart_account_id:
            account = db.get(ChartAccount, line.chart_account_id)
            if not account or not account.is_active:
                raise HTTPException(422, f"Line {index}: expense account is not active")
        if line.cost_center_id:
            center = db.get(CostCenter, line.cost_center_id)
            if not center or not center.is_active:
                raise HTTPException(422, f"Line {index}: cost center is not active")
    return sum((line.amount for line in payload.lines), Decimal("0"))


def submission_validation_errors(db: Session, item: PaymentRequest) -> list[dict[str, str]]:
    lines = list(
        db.scalars(
            select(PaymentRequestLine)
            .where(PaymentRequestLine.request_id == item.id)
            .order_by(PaymentRequestLine.position)
        )
    )
    data = item.type_data or {}
    errors: list[dict[str, str]] = []

    def require(condition: object, field: str, message: str) -> None:
        if not condition:
            errors.append({"field": field, "message": message})

    def valid_date(value: object) -> bool:
        try:
            date.fromisoformat(str(value))
            return True
        except (TypeError, ValueError):
            return False

    def decimal_value(value: object) -> Decimal:
        try:
            return Decimal(str(value or 0))
        except Exception:
            return Decimal("0")

    require(item.purpose.strip(), "purpose", "Event or payment purpose is required")
    require(lines, "lines", "At least one line item is required")
    require(item.gross_amount > 0, "gross_amount", "The request total must be greater than zero")
    for position, line in enumerate(lines, 1):
        prefix = f"lines.{position - 1}"
        require(line.particulars.strip(), f"{prefix}.particulars", f"Line {position}: particulars are required")
        require(line.amount > 0, f"{prefix}.amount", f"Line {position}: amount must be greater than zero")
        require(
            line.currency_code == item.currency_code,
            f"{prefix}.currency_code",
            f"Line {position}: currency must match the request",
        )

    if item.request_type == "reimbursement":
        for position, line in enumerate(lines, 1):
            prefix = f"lines.{position - 1}"
            require(line.vendor_name.strip(), f"{prefix}.vendor_name", f"Line {position}: merchant is required")
            require(line.invoice_date, f"{prefix}.invoice_date", f"Line {position}: invoice date is required")
            require(
                line.invoice_number and line.invoice_number.strip(),
                f"{prefix}.invoice_number",
                f"Line {position}: invoice number is required",
            )
            require(
                line.chart_account_id, f"{prefix}.chart_account_id", f"Line {position}: expense account is required"
            )
            require(line.cost_center_id, f"{prefix}.cost_center_id", f"Line {position}: cost center is required")
            require(
                line.attachment_refs, f"{prefix}.attachment_refs", f"Line {position}: invoice or receipt is required"
            )
        require(data.get("proof_of_payment_refs"), "type_data.proof_of_payment_refs", "Proof of payment is required")
    elif item.request_type == "cashAdvance":
        require(
            valid_date(data.get("event_end_date")),
            "type_data.event_end_date",
            "A valid last day of the event is required",
        )
        require(
            valid_date(data.get("liquidation_due_date")),
            "type_data.liquidation_due_date",
            "A valid liquidation due date is required",
        )
        require(
            data.get("accountability_acknowledged") is True,
            "type_data.accountability_acknowledged",
            "Accountability acknowledgement is required",
        )
    elif item.request_type == "liquidation":
        require(
            data.get("cash_advance_reference"), "type_data.cash_advance_reference", "Cash Advance reference is required"
        )
        require(
            valid_date(data.get("liquidation_due_date")),
            "type_data.liquidation_due_date",
            "A valid date to be liquidated is required",
        )
        require(
            valid_date(data.get("actual_liquidation_date")),
            "type_data.actual_liquidation_date",
            "A valid actual liquidation date is required",
        )
        require(
            decimal_value(data.get("liquidation_advance_amount")) > 0,
            "type_data.liquidation_advance_amount",
            "Cash Advance amount must be greater than zero",
        )
        for position, line in enumerate(lines, 1):
            prefix = f"lines.{position - 1}"
            require(line.vendor_name.strip(), f"{prefix}.vendor_name", f"Line {position}: merchant is required")
            require(line.invoice_date, f"{prefix}.invoice_date", f"Line {position}: invoice date is required")
            require(
                line.invoice_number and line.invoice_number.strip(),
                f"{prefix}.invoice_number",
                f"Line {position}: invoice number is required",
            )
            require(
                line.chart_account_id, f"{prefix}.chart_account_id", f"Line {position}: expense account is required"
            )
            require(line.cost_center_id, f"{prefix}.cost_center_id", f"Line {position}: cost center is required")
            require(
                line.attachment_refs, f"{prefix}.attachment_refs", f"Line {position}: invoice or receipt is required"
            )
        if decimal_value(data.get("liquidation_advance_amount")) > item.gross_amount:
            require(
                data.get("proof_of_return_refs"),
                "type_data.proof_of_return_refs",
                "Proof of unused cash return is required",
            )
    elif item.request_type == "poPayment":
        require(data.get("po_reference"), "type_data.po_reference", "Approved P.O. reference is required")
        require(item.payee_name.strip(), "payee_name", "P.O. supplier is required")
        for position, line in enumerate(lines, 1):
            prefix = f"lines.{position - 1}"
            require(
                line.chart_account_id, f"{prefix}.chart_account_id", f"Line {position}: expense account is required"
            )
            require(line.cost_center_id, f"{prefix}.cost_center_id", f"Line {position}: cost center is required")
        require(
            data.get("approved_po_refs") or any(line.attachment_refs for line in lines),
            "type_data.approved_po_refs",
            "Approved P.O. document is required",
        )
    elif item.request_type == "general":
        require(item.payee_name.strip(), "payee_name", "Payee or vendor is required")
        for position, line in enumerate(lines, 1):
            prefix = f"lines.{position - 1}"
            require(line.vendor_name.strip(), f"{prefix}.vendor_name", f"Line {position}: merchant is required")
            require(
                line.chart_account_id, f"{prefix}.chart_account_id", f"Line {position}: expense account is required"
            )
            require(line.cost_center_id, f"{prefix}.cost_center_id", f"Line {position}: cost center is required")
        require(
            data.get("billing_document_refs") or any(line.attachment_refs for line in lines),
            "type_data.billing_document_refs",
            "Billing document or invoice is required",
        )
    return errors


def ensure_submittable(db: Session, item: PaymentRequest) -> None:
    errors = submission_validation_errors(db, item)
    if errors:
        raise HTTPException(422, detail={"message": "Request is incomplete", "errors": errors})


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
def list_payment_requests(
    request: Request,
    response: Response,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=100),
    search: str = Query(default="", max_length=200),
    request_type: str | None = Query(default=None),
    status: str | None = Query(default=None),
    department: str | None = Query(default=None, max_length=120),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    min_amount: Decimal | None = Query(default=None, ge=0),
    max_amount: Decimal | None = Query(default=None, ge=0),
    sort_by: Literal["submitted", "updated", "voucher", "type", "status", "amount"] = "updated",
    sort_direction: Literal["asc", "desc"] = "desc",
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    query = visible_query(request, actor)
    if search.strip():
        needle = f"%{search.strip()}%"
        query = query.where(
            or_(
                PaymentRequest.request_number.ilike(needle),
                PaymentRequest.payee_name.ilike(needle),
                PaymentRequest.purpose.ilike(needle),
            )
        )
    if request_type:
        query = query.where(PaymentRequest.request_type == request_type)
    if status:
        query = query.where(PaymentRequest.status == status)
    if department:
        query = query.where(
            PaymentRequest.department_id.in_(
                select(Department.id).where(
                    or_(
                        Department.id.cast(String) == department,
                        Department.code == department,
                        Department.name == department,
                    )
                )
            )
        )
    effective_date = func.coalesce(PaymentRequest.submitted_at, PaymentRequest.updated_at)
    if date_from:
        query = query.where(func.date(effective_date) >= date_from)
    if date_to:
        query = query.where(func.date(effective_date) <= date_to)
    if min_amount is not None:
        query = query.where(PaymentRequest.gross_amount >= min_amount)
    if max_amount is not None:
        query = query.where(PaymentRequest.gross_amount <= max_amount)
    if min_amount is not None and max_amount is not None and min_amount > max_amount:
        raise HTTPException(422, "min_amount cannot exceed max_amount")
    sort_columns = {
        "submitted": effective_date,
        "updated": PaymentRequest.updated_at,
        "voucher": PaymentRequest.request_number,
        "type": PaymentRequest.request_type,
        "status": PaymentRequest.status,
        "amount": PaymentRequest.gross_amount,
    }
    sort_column = sort_columns[sort_by]
    order = sort_column.asc().nulls_last() if sort_direction == "asc" else sort_column.desc().nulls_last()
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Page"] = str(page)
    response.headers["X-Page-Size"] = str(page_size)
    items = list(
        db.scalars(
            query.order_by(order, PaymentRequest.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return serialize_many(db, items)


@router.get("/{request_id}")
def get_payment_request(
    request_id: UUID, request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)
):
    item = get_visible(db, request, actor, request_id)
    result = serialize(db, item)
    if item.requestor_id != actor.id and "requests.read_all" in permissions(request):
        audit(
            db,
            actor_id=actor.id,
            action="payment_request.privileged_read",
            entity_type="payment_request",
            entity_id=item.id,
            request_id=request.state.request_id,
            after={"status": item.status},
        )
        db.commit()
    return result


@router.patch("/{request_id}")
def update_payment_request(
    request_id: UUID,
    payload: PaymentRequestUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    item = get_visible(db, request, actor, request_id, lock_for_update=True)
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
    item = get_visible(db, request, actor, request_id, lock_for_update=True)
    if item.requestor_id != actor.id or item.status != "draft":
        raise HTTPException(409, "Only the owner can delete a draft")
    db.delete(item)
    db.commit()


def numbering_reset_month(db: Session) -> int:
    setting = db.scalar(select(SystemSetting).where(SystemSetting.key == NUMBERING_RESET_MONTH_KEY))
    try:
        month = int(setting.value) if setting else 7
    except (TypeError, ValueError):
        month = 7
    return month if 1 <= month <= 12 else 7


def academic_year_start(moment: datetime, reset_month: int) -> int:
    return moment.year if moment.month >= reset_month else moment.year - 1


def next_number(db: Session, *, moment: datetime | None = None) -> str:
    year = academic_year_start(moment or datetime.now(UTC), numbering_reset_month(db))
    # Serialize creation as well as increment of the annual counter. A row lock
    # alone cannot protect the first request in a new academic year.
    db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": year})
    sequence = db.get(RequestSequence, year, with_for_update=True)
    if not sequence:
        sequence = RequestSequence(year=year, last_value=0)
        db.add(sequence)
        db.flush()
    sequence.last_value += 1
    return f"PR-{year}-{sequence.last_value:06d}"


@settings_router.get("/numbering")
def get_numbering_setting(db: Session = Depends(get_db), actor: User = Depends(current_user)):
    reset_month = numbering_reset_month(db)
    start_year = academic_year_start(datetime.now(UTC), reset_month)
    return {
        "reset_month": reset_month,
        "current_academic_year": f"{start_year}-{start_year + 1}",
        "number_preview": f"PR-{start_year}-000001",
    }


@settings_router.put("/numbering")
def update_numbering_setting(
    payload: RequestNumberingSettingUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    if "requests.numbering.manage" not in permissions(request):
        raise HTTPException(403, "Permission required: requests.numbering.manage")
    item = db.scalar(select(SystemSetting).where(SystemSetting.key == NUMBERING_RESET_MONTH_KEY))
    before = {"reset_month": numbering_reset_month(db)}
    if item is None:
        item = SystemSetting(key=NUMBERING_RESET_MONTH_KEY, value=str(payload.reset_month))
        db.add(item)
        db.flush()
    else:
        item.value = str(payload.reset_month)
    after = {"reset_month": payload.reset_month}
    audit(
        db,
        actor_id=actor.id,
        action="request_numbering.updated",
        entity_type="system_setting",
        entity_id=item.id,
        request_id=request.state.request_id,
        before=before,
        after=after,
    )
    db.commit()
    return after


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
    item = get_visible(db, request, actor, request_id, lock_for_update=True)
    # Another transaction may have completed this command while this request
    # waited for the row lock.
    existing = db.scalar(
        select(RequestCommand).where(
            RequestCommand.actor_user_id == actor.id,
            RequestCommand.action == "submit",
            RequestCommand.idempotency_key == idempotency_key,
        )
    )
    if existing:
        return existing.result
    if item.requestor_id != actor.id or item.status not in {"draft", "returned"}:
        raise HTTPException(409, "Request cannot be submitted")
    if item.version != payload.version:
        raise HTTPException(409, "This request was updated elsewhere; reload before submitting")
    ensure_submittable(db, item)
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
    item = get_visible(db, request, actor, request_id, lock_for_update=True)
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


def lifecycle_change(
    db: Session,
    *,
    item: PaymentRequest,
    actor: User,
    target_status: str,
    note: str,
    request: Request,
    commit: bool = True,
) -> dict:
    previous = item.status
    item.status = target_status
    item.version += 1
    if target_status == "cancelled":
        item.cancelled_at = datetime.now(UTC)
    elif previous == "cancelled":
        item.cancelled_at = None
    if target_status == "submitted":
        item.submitted_at = datetime.now(UTC)
        item.request_number = item.request_number or next_number(db)
    db.add(
        PaymentRequestStatusHistory(
            request_id=item.id,
            from_status=previous,
            to_status=target_status,
            actor_user_id=actor.id,
            note=note,
        )
    )
    db.flush()
    result = snapshot(db, item, actor)
    audit(
        db,
        actor_id=actor.id,
        action=f"payment_request.{target_status}",
        entity_type="payment_request",
        entity_id=item.id,
        request_id=request.state.request_id,
        before={"status": previous},
        after={"status": target_status, "version": item.version},
    )
    if commit:
        db.commit()
    return result


@router.post("/{request_id}/cancel")
def cancel_payment_request(
    request_id: UUID,
    payload: RequestTransition,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    item = get_visible(db, request, actor, request_id, lock_for_update=True)
    allowed = item.requestor_id == actor.id or "requests.manage_lifecycle" in permissions(request)
    if not allowed or item.status not in {"draft", "submitted", "returned"}:
        raise HTTPException(409, "Request cannot be cancelled by this user or from its current status")
    if item.version != payload.version:
        raise HTTPException(409, "This request was updated elsewhere; reload before cancelling")
    if item.status != "draft" and not payload.note.strip():
        raise HTTPException(422, "A cancellation reason is required after submission")
    return lifecycle_change(db, item=item, actor=actor, target_status="cancelled", note=payload.note, request=request)


@router.post("/{request_id}/reopen")
def reopen_payment_request(
    request_id: UUID,
    payload: RequestTransition,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    if "requests.manage_lifecycle" not in permissions(request):
        raise HTTPException(403, "Permission required: requests.manage_lifecycle")
    item = get_visible(db, request, actor, request_id, lock_for_update=True)
    if item.status != "cancelled" or item.version != payload.version or not payload.note.strip():
        raise HTTPException(409, "Only a cancelled request can be reopened with the current version and a reason")
    return lifecycle_change(db, item=item, actor=actor, target_status="draft", note=payload.note, request=request)


@router.post("/{request_id}/resubmit")
def resubmit_payment_request(
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
            RequestCommand.action == "resubmit",
            RequestCommand.idempotency_key == idempotency_key,
        )
    )
    if existing:
        return existing.result
    item = get_visible(db, request, actor, request_id, lock_for_update=True)
    existing = db.scalar(
        select(RequestCommand).where(
            RequestCommand.actor_user_id == actor.id,
            RequestCommand.action == "resubmit",
            RequestCommand.idempotency_key == idempotency_key,
        )
    )
    if existing:
        return existing.result
    if item.requestor_id != actor.id or item.status != "returned" or item.version != payload.version:
        raise HTTPException(409, "Only the owner can resubmit a returned request at its current version")
    if not payload.note.strip():
        raise HTTPException(422, "A resubmission note is required")
    ensure_submittable(db, item)
    result = lifecycle_change(
        db, item=item, actor=actor, target_status="submitted", note=payload.note, request=request, commit=False
    )
    db.add(
        RequestCommand(
            request_id=item.id,
            actor_user_id=actor.id,
            action="resubmit",
            idempotency_key=idempotency_key,
            result=result,
        )
    )
    db.commit()
    return result
