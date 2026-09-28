from calendar import monthrange
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

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
    Document,
    DocumentRequirementRule,
    DocumentType,
    PaymentRequest,
    PaymentRequestLine,
    PaymentRequestStatusHistory,
    PaymentRequestVersion,
    RequestCommand,
    RequestSequence,
    SystemSetting,
    User,
)
from ..procurement_adapter import get_procurement_adapter
from ..schemas import (
    PaymentRequestCreate,
    PaymentRequestUpdate,
    ReimbursementBatchSettingUpdate,
    RequestNumberingSettingUpdate,
    RequestTransition,
)
from ..security import current_user
from ..vendor_adapter import get_vendor_adapter

router = APIRouter(prefix="/api/v1/requests", tags=["payment requests"])
settings_router = APIRouter(prefix="/api/v1/request-settings", tags=["payment request settings"])
NUMBERING_RESET_MONTH_KEY = "requests.numbering_reset_month"
REIMBURSEMENT_BATCH_CUTOFFS_KEY = "requests.reimbursement_batch_cutoffs"
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
        departments.get(item.department_id) if departments is not None else db.get(Department, item.department_id)
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

    if item.request_type in {"reimbursement", "cashAdvance", "liquidation"}:
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
    elif item.request_type == "cashAdvance":
        event_end_date = data.get("event_end_date")
        liquidation_due_date = data.get("liquidation_due_date")
        require(
            valid_date(event_end_date),
            "type_data.event_end_date",
            "A valid last day of the event is required",
        )
        require(
            valid_date(liquidation_due_date),
            "type_data.liquidation_due_date",
            "A valid liquidation due date is required",
        )
        if valid_date(event_end_date) and valid_date(liquidation_due_date):
            expected_due_date = date.fromisoformat(str(event_end_date)) + timedelta(days=15)
            require(
                date.fromisoformat(str(liquidation_due_date)) == expected_due_date,
                "type_data.liquidation_due_date",
                "Liquidation is due exactly 15 calendar days after the event",
            )
        if item.currency_code == "PHP":
            require(
                item.gross_amount <= Decimal("40000"),
                "gross_amount",
                "Cash Advance amount cannot exceed PHP 40,000",
            )
        prior_advances = list(
            db.scalars(
                select(PaymentRequest).where(
                    PaymentRequest.id != item.id,
                    PaymentRequest.requestor_id == item.requestor_id,
                    PaymentRequest.request_type == "cashAdvance",
                    PaymentRequest.status == "submitted",
                    PaymentRequest.request_number.is_not(None),
                )
            )
        )
        liquidated_references = {
            str(candidate.type_data.get("cash_advance_reference"))
            for candidate in db.scalars(
                select(PaymentRequest).where(
                    PaymentRequest.requestor_id == item.requestor_id,
                    PaymentRequest.request_type == "liquidation",
                    PaymentRequest.status == "submitted",
                )
            )
            if candidate.type_data and candidate.type_data.get("cash_advance_reference")
        }
        outstanding = [
            advance for advance in prior_advances if str(advance.request_number) not in liquidated_references
        ]
        require(
            not outstanding,
            "requestor_id",
            "The requestor already has an outstanding Cash Advance that must be liquidated first",
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
        if decimal_value(data.get("liquidation_advance_amount")) > item.gross_amount:
            expected_return = decimal_value(data.get("liquidation_advance_amount")) - item.gross_amount
            require(
                decimal_value(data.get("liquidation_return_amount")) == expected_return,
                "type_data.liquidation_return_amount",
                "Amount returned offline must equal the excess Cash Advance balance",
            )
    elif item.request_type == "poPayment":
        po_reference = str(data.get("po_reference") or "").strip()
        require(po_reference, "type_data.po_reference", "Approved P.O. reference is required")
        require(item.payee_name.strip(), "payee_name", "P.O. supplier is required")
        purchase_order = get_procurement_adapter().get(po_reference) if po_reference else None
        require(purchase_order, "type_data.po_reference", "P.O. reference was not found in Procurement")
        if purchase_order:
            require(
                purchase_order.get("paymentEligible") is True,
                "type_data.po_reference",
                "P.O. is not approved and eligible for payment",
            )
            require(
                item.currency_code == purchase_order.get("currency"),
                "currency_code",
                "Request currency must match the approved P.O.",
            )
            require(
                item.gross_amount == Decimal(str(purchase_order.get("amount", 0))),
                "gross_amount",
                "Request amount must match the approved P.O.",
            )
            require(
                _normalized_match_text(item.payee_name) == _normalized_match_text(purchase_order.get("vendorName")),
                "payee_name",
                "Payee must match the approved P.O. vendor",
            )
            duplicate = next(
                (
                    candidate
                    for candidate in db.scalars(
                        select(PaymentRequest).where(
                            PaymentRequest.id != item.id,
                            PaymentRequest.request_type == "poPayment",
                            PaymentRequest.status.in_(("submitted", "returned")),
                        )
                    )
                    if str((candidate.type_data or {}).get("po_reference") or "").strip() == po_reference
                ),
                None,
            )
            require(
                duplicate is None,
                "type_data.po_reference",
                "This P.O. is already linked to another active payment request",
            )
        for position, line in enumerate(lines, 1):
            prefix = f"lines.{position - 1}"
            require(
                line.chart_account_id, f"{prefix}.chart_account_id", f"Line {position}: expense account is required"
            )
            require(line.cost_center_id, f"{prefix}.cost_center_id", f"Line {position}: cost center is required")
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
    errors = submission_validation_errors(db, item) + document_requirement_errors(db, item)
    if errors:
        raise HTTPException(422, detail={"message": "Request is incomplete", "errors": errors})


def lock_submission_constraints(db: Session, item: PaymentRequest) -> None:
    """Serialize rules whose result depends on other submitted requests."""
    if item.request_type == "poPayment":
        reference = str((item.type_data or {}).get("po_reference") or "").strip()
        if reference:
            db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": f"po:{reference}"})
    elif item.request_type == "cashAdvance":
        db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": f"ca:{item.requestor_id}"})


def record_procurement_snapshot(item: PaymentRequest) -> None:
    """Freeze safe Procurement and vendor facts used to approve a P.O. submission."""
    if item.request_type != "poPayment":
        return
    data = dict(item.type_data or {})
    reference = str(data.get("po_reference") or "").strip()
    purchase_order = get_procurement_adapter().get(reference)
    if not purchase_order:
        return
    vendor = get_vendor_adapter().get(str(purchase_order.get("vendorId") or ""))
    data["procurement_snapshot"] = {
        "captured_at": datetime.now(UTC).isoformat(),
        "purchase_order": purchase_order,
        "vendor": vendor,
    }
    item.type_data = data


def document_requirement_errors(db: Session, item: PaymentRequest) -> list[dict]:
    """Evaluate only active configured rules; an unconfigured request type remains non-blocking."""
    rules = list(
        db.scalars(
            select(DocumentRequirementRule).where(
                DocumentRequirementRule.request_type == item.request_type,
                DocumentRequirementRule.is_active.is_(True),
            )
        )
    )
    if not rules:
        return []
    documents = list(db.scalars(select(Document).where(Document.request_id == item.id, Document.removed_at.is_(None))))
    lines = list(db.scalars(select(PaymentRequestLine).where(PaymentRequestLine.request_id == item.id)))
    errors = []
    for rule in rules:
        document_type = db.get(DocumentType, rule.document_type_id)
        conditionally_required = bool(
            item.request_type == "general"
            and document_type
            and document_type.code == "BIR_2303"
            and (item.type_data or {}).get("new_supplier") is True
        )
        if not rule.is_required and not conditionally_required:
            continue
        label = document_type.name if document_type else "Required document"
        matching = [document for document in documents if document.document_type_id == rule.document_type_id]
        if rule.scope == "line":
            for line in lines:
                count = len([document for document in matching if document.line_id == line.id])
                if count < rule.minimum_count:
                    errors.append(
                        {
                            "field": f"lines.{line.position - 1}.documents",
                            "message": f"Line {line.position}: {label} is required",
                        }
                    )
        elif len([document for document in matching if document.line_id is None]) < rule.minimum_count:
            errors.append({"field": "documents", "message": f"{label} is required"})
    return errors


def _normalized_invoice_reference(value: str | None) -> str:
    return "".join((value or "").casefold().split())


def _normalized_match_text(value: str | None) -> str:
    return " ".join((value or "").casefold().split())


def record_duplicate_invoice_checks(db: Session, item: PaymentRequest) -> None:
    """Store non-blocking invoice matches for Finance review at submission time."""
    data = dict(item.type_data or {})
    if item.request_type not in {"reimbursement", "liquidation"}:
        data.pop("duplicate_invoice_checks", None)
        data.pop("duplicate_invoice_review_status", None)
        item.type_data = data
        return

    lines = list(
        db.scalars(
            select(PaymentRequestLine)
            .where(PaymentRequestLine.request_id == item.id)
            .order_by(PaymentRequestLine.position)
        )
    )
    checks: list[dict] = []
    for line in lines:
        reference = _normalized_invoice_reference(line.invoice_number)
        if not reference:
            continue
        candidates = db.execute(
            select(PaymentRequestLine, PaymentRequest)
            .join(PaymentRequest, PaymentRequest.id == PaymentRequestLine.request_id)
            .where(
                PaymentRequestLine.request_id != item.id,
                PaymentRequest.status.in_(("submitted", "returned", "cancelled")),
                func.lower(func.regexp_replace(PaymentRequestLine.invoice_number, r"\s+", "", "g")) == reference,
            )
            .order_by(PaymentRequest.submitted_at.desc().nullslast(), PaymentRequestLine.position)
        ).all()
        for candidate, prior_request in candidates:
            compared = {
                "invoice_number": _normalized_invoice_reference(candidate.invoice_number) == reference,
                "vendor_name": _normalized_match_text(candidate.vendor_name)
                == _normalized_match_text(line.vendor_name),
                "invoice_date": candidate.invoice_date == line.invoice_date,
                "amount": candidate.amount == line.amount,
                "currency_code": candidate.currency_code == line.currency_code,
                "particulars": _normalized_match_text(candidate.particulars)
                == _normalized_match_text(line.particulars),
                "chart_account_id": candidate.chart_account_id == line.chart_account_id,
                "cost_center_id": candidate.cost_center_id == line.cost_center_id,
            }
            exact = all(compared.values())
            checks.append(
                {
                    "line_position": line.position,
                    "match_level": "exact" if exact else "warning",
                    "finance_verification_required": True,
                    "message": (
                        "Exact invoice match found; Finance verification is required."
                        if exact
                        else (
                            "Invoice reference matches but other information differs; Finance verification is required."
                        )
                    ),
                    "matched_fields": [field for field, matches in compared.items() if matches],
                    "differing_fields": [field for field, matches in compared.items() if not matches],
                    "prior_request_id": str(prior_request.id),
                    "prior_request_number": prior_request.request_number,
                    "prior_request_status": prior_request.status,
                    "prior_line_id": str(candidate.id),
                    "invoice_number": line.invoice_number,
                    "prior_amount": str(candidate.amount),
                    "prior_currency_code": candidate.currency_code,
                }
            )
    data["duplicate_invoice_checks"] = checks
    data["duplicate_invoice_review_status"] = "finance_verification_required" if checks else "no_match"
    item.type_data = data


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
        db.scalars(query.order_by(order, PaymentRequest.id.desc()).offset((page - 1) * page_size).limit(page_size))
    )
    return serialize_many(db, items)


@router.get("/cash-advance-options")
def list_own_cash_advance_options(db: Session = Depends(get_db), actor: User = Depends(current_user)):
    items = db.scalars(
        select(PaymentRequest)
        .where(
            PaymentRequest.requestor_id == actor.id,
            PaymentRequest.request_type == "cashAdvance",
            PaymentRequest.request_number.is_not(None),
            PaymentRequest.status.notin_(("draft", "cancelled", "archived")),
        )
        .order_by(PaymentRequest.created_at.desc(), PaymentRequest.id.desc())
    )
    return [
        {
            "request_number": item.request_number,
            "amount": str(item.gross_amount),
            "currency_code": item.currency_code,
            "status": item.status,
            "created_at": item.created_at.isoformat(),
        }
        for item in items
    ]


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


@router.get("/{request_id}/history")
def get_payment_request_history(
    request_id: UUID, request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)
):
    item = get_visible(db, request, actor, request_id)
    history = db.scalars(
        select(PaymentRequestStatusHistory)
        .where(PaymentRequestStatusHistory.request_id == item.id)
        .order_by(PaymentRequestStatusHistory.occurred_at, PaymentRequestStatusHistory.id)
    )
    return [
        {
            "id": str(entry.id),
            "from_status": entry.from_status,
            "to_status": entry.to_status,
            "actor_user_id": str(entry.actor_user_id),
            "note": entry.note,
            "occurred_at": entry.occurred_at.isoformat(),
        }
        for entry in history
    ]


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


def reimbursement_batch_cutoffs(db: Session) -> list[int]:
    setting = db.scalar(select(SystemSetting).where(SystemSetting.key == REIMBURSEMENT_BATCH_CUTOFFS_KEY))
    try:
        values = sorted({int(value.strip()) for value in setting.value.split(",")}) if setting else [15, 30]
    except (AttributeError, TypeError, ValueError):
        values = [15, 30]
    return values if values and all(1 <= value <= 31 for value in values) else [15, 30]


def reimbursement_batch_date(moment: date, cutoff_days: list[int]) -> date:
    year, month = moment.year, moment.month
    for _ in range(2):
        last_day = monthrange(year, month)[1]
        candidates = sorted({date(year, month, min(day, last_day)) for day in cutoff_days})
        available = [candidate for candidate in candidates if candidate >= moment]
        if available:
            return available[0]
        month = 1 if month == 12 else month + 1
        year = year + 1 if month == 1 else year
        moment = date(year, month, 1)
    raise RuntimeError("Unable to calculate reimbursement batch")


def assign_reimbursement_batch(db: Session, item: PaymentRequest) -> None:
    if item.request_type != "reimbursement":
        return
    local_date = datetime.now(ZoneInfo(app_settings.database_timezone)).date()
    batch_date = reimbursement_batch_date(local_date, reimbursement_batch_cutoffs(db))
    item.type_data = {**(item.type_data or {}), "reimbursement_batch_date": batch_date.isoformat()}


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


@settings_router.get("/reimbursement-batches")
def get_reimbursement_batch_setting(db: Session = Depends(get_db), actor: User = Depends(current_user)):
    return {
        "cutoff_days": reimbursement_batch_cutoffs(db),
        "month_end_fallback": True,
        "late_submission_handling": "next_batch",
    }


@settings_router.put("/reimbursement-batches")
def update_reimbursement_batch_setting(
    payload: ReimbursementBatchSettingUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    if "requests.numbering.manage" not in permissions(request):
        raise HTTPException(403, "Permission required: requests.numbering.manage")
    cutoff_days = sorted(set(payload.cutoff_days))
    if len(cutoff_days) != len(payload.cutoff_days) or any(day < 1 or day > 31 for day in cutoff_days):
        raise HTTPException(422, "Cutoff days must be unique calendar days from 1 through 31")
    item = db.scalar(select(SystemSetting).where(SystemSetting.key == REIMBURSEMENT_BATCH_CUTOFFS_KEY))
    before = {"cutoff_days": reimbursement_batch_cutoffs(db)}
    value = ",".join(str(day) for day in cutoff_days)
    if item is None:
        item = SystemSetting(key=REIMBURSEMENT_BATCH_CUTOFFS_KEY, value=value)
        db.add(item)
        db.flush()
    else:
        item.value = value
    after = {"cutoff_days": cutoff_days, "month_end_fallback": True, "late_submission_handling": "next_batch"}
    audit(
        db,
        actor_id=actor.id,
        action="reimbursement_batch_settings.updated",
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
    lock_submission_constraints(db, item)
    ensure_submittable(db, item)
    assign_reimbursement_batch(db, item)
    record_procurement_snapshot(item)
    record_duplicate_invoice_checks(db, item)
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
    lock_submission_constraints(db, item)
    ensure_submittable(db, item)
    assign_reimbursement_batch(db, item)
    record_procurement_snapshot(item)
    record_duplicate_invoice_checks(db, item)
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
