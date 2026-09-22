from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..audit import audit
from ..database import get_db
from ..models import (
    ChartAccount,
    Currency,
    DocumentType,
    PaymentMethod,
    TaxCode,
    User,
)
from ..schemas import (
    ChartAccountCreate,
    ChartAccountUpdate,
    CurrencyCreate,
    CurrencyUpdate,
    DocumentTypeCreate,
    DocumentTypeUpdate,
    PaymentMethodCreate,
    PaymentMethodUpdate,
    TaxCodeCreate,
    TaxCodeUpdate,
)
from ..security import require_permission
from ..services.master_data import ensure_account_parent, ensure_unique, normalized
from ..vendor_adapter import get_vendor_adapter

router = APIRouter(prefix="/api/v1", tags=["master data"])


def row(item) -> dict:
    result = {column.name: getattr(item, column.name) for column in item.__table__.columns}
    for key, value in tuple(result.items()):
        if isinstance(value, UUID):
            result[key] = str(value)
        elif isinstance(value, Decimal):
            result[key] = float(value)
        elif isinstance(value, date | datetime):
            result[key] = value.isoformat()
    return result


def json_values(values: dict) -> dict:
    result = {}
    for key, value in values.items():
        if isinstance(value, date | datetime):
            value = value.isoformat()
        elif isinstance(value, UUID):
            value = str(value)
        result[key] = value
    return result


def list_rows(
    db: Session, model, search: str, active: bool | None, page: int, page_size: int, response: Response
) -> list[dict]:
    query = select(model)
    if search:
        query = query.where(or_(model.code.ilike(f"%{search.strip()}%"), model.name.ilike(f"%{search.strip()}%")))
    if active is not None:
        query = query.where(model.is_active == active)
    response.headers["X-Total-Count"] = str(db.scalar(select(func.count()).select_from(query.subquery())) or 0)
    response.headers["X-Page"] = str(page)
    response.headers["X-Page-Size"] = str(page_size)
    return [
        row(item)
        for item in db.scalars(query.order_by(model.name, model.code).offset((page - 1) * page_size).limit(page_size))
    ]


def create_reference(
    db: Session, model, payload, request: Request, actor: User, entity: str, extra: dict | None = None
) -> dict:
    values = normalized(payload.model_dump())
    if extra:
        values.update(extra)
    ensure_unique(db, model, values["code"], values["name"])
    item = model(**values)
    db.add(item)
    db.flush()
    audit(
        db,
        actor_id=actor.id,
        action=f"{entity}.created",
        entity_type=entity,
        entity_id=item.id,
        request_id=request.state.request_id,
        after=row(item),
    )
    db.commit()
    return row(item)


def update_reference(db: Session, model, item_id: UUID, payload, request: Request, actor: User, entity: str) -> dict:
    item = db.get(model, item_id)
    if not item:
        raise HTTPException(404, f"{entity.replace('_', ' ').title()} not found")
    changes = normalized(payload.model_dump(exclude_unset=True))
    ensure_unique(db, model, changes.get("code", item.code), changes.get("name", item.name), item.id)
    before = row(item)
    for key, value in changes.items():
        setattr(item, key, value)
    audit(
        db,
        actor_id=actor.id,
        action=f"{entity}.updated",
        entity_type=entity,
        entity_id=item.id,
        request_id=request.state.request_id,
        before=before,
        after=json_values(changes),
    )
    db.commit()
    return row(item)


def delete_reference(db: Session, model, item_id: UUID, request: Request, actor: User, entity: str) -> None:
    item = db.get(model, item_id)
    if not item:
        raise HTTPException(404, f"{entity.replace('_', ' ').title()} not found")
    audit(
        db,
        actor_id=actor.id,
        action=f"{entity}.deleted",
        entity_type=entity,
        entity_id=item.id,
        request_id=request.state.request_id,
        before=row(item),
    )
    try:
        db.delete(item)
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(409, "Referenced records must be deactivated rather than deleted") from error


@router.get("/cost-centers")
def cost_centers(
    response: Response,
    search: str = "",
    active: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=100),
    _: User = Depends(require_permission("master_data.read")),
    db: Session = Depends(get_db),
):
    from ..models import CostCenter

    return list_rows(db, CostCenter, search, active, page, page_size, response)


@router.get("/chart-of-accounts")
def accounts(
    response: Response,
    search: str = "",
    active: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=100),
    _: User = Depends(require_permission("accounts.read")),
    db: Session = Depends(get_db),
):
    return list_rows(db, ChartAccount, search, active, page, page_size, response)


@router.post("/chart-of-accounts", status_code=201)
def create_account(
    payload: ChartAccountCreate,
    request: Request,
    actor: User = Depends(require_permission("accounts.manage")),
    db: Session = Depends(get_db),
):
    ensure_account_parent(db, None, payload.parent_id)
    return create_reference(db, ChartAccount, payload, request, actor, "chart_account")


@router.patch("/chart-of-accounts/{item_id}")
def update_account(
    item_id: UUID,
    payload: ChartAccountUpdate,
    request: Request,
    actor: User = Depends(require_permission("accounts.manage")),
    db: Session = Depends(get_db),
):
    if "parent_id" in payload.model_fields_set:
        ensure_account_parent(db, item_id, payload.parent_id)
    return update_reference(db, ChartAccount, item_id, payload, request, actor, "chart_account")


@router.delete("/chart-of-accounts/{item_id}", status_code=204)
def delete_account(
    item_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("accounts.manage")),
    db: Session = Depends(get_db),
):
    delete_reference(db, ChartAccount, item_id, request, actor, "chart_account")


@router.get("/tax-codes")
def tax_codes(
    response: Response,
    search: str = "",
    active: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=100),
    _: User = Depends(require_permission("master_data.read")),
    db: Session = Depends(get_db),
):
    return list_rows(db, TaxCode, search, active, page, page_size, response)


@router.post("/tax-codes", status_code=201)
def create_tax(
    payload: TaxCodeCreate,
    request: Request,
    actor: User = Depends(require_permission("master_data.manage")),
    db: Session = Depends(get_db),
):
    return create_reference(db, TaxCode, payload, request, actor, "tax_code")


@router.patch("/tax-codes/{item_id}")
def update_tax(
    item_id: UUID,
    payload: TaxCodeUpdate,
    request: Request,
    actor: User = Depends(require_permission("master_data.manage")),
    db: Session = Depends(get_db),
):
    return update_reference(db, TaxCode, item_id, payload, request, actor, "tax_code")


@router.delete("/tax-codes/{item_id}", status_code=204)
def delete_tax(
    item_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("master_data.manage")),
    db: Session = Depends(get_db),
):
    delete_reference(db, TaxCode, item_id, request, actor, "tax_code")


@router.get("/currencies")
def currencies(
    response: Response,
    active: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=100),
    _: User = Depends(require_permission("master_data.read")),
    db: Session = Depends(get_db),
):
    query = select(Currency)
    if active is not None:
        query = query.where(Currency.is_active == active)
    response.headers["X-Total-Count"] = str(db.scalar(select(func.count()).select_from(query.subquery())) or 0)
    response.headers["X-Page"] = str(page)
    response.headers["X-Page-Size"] = str(page_size)
    return [
        row(item) for item in db.scalars(query.order_by(Currency.code).offset((page - 1) * page_size).limit(page_size))
    ]


@router.post("/currencies", status_code=201)
def create_currency(
    payload: CurrencyCreate,
    request: Request,
    actor: User = Depends(require_permission("master_data.manage")),
    db: Session = Depends(get_db),
):
    values = normalized(payload.model_dump())
    item = Currency(**values)
    if db.get(Currency, item.code) or db.scalar(select(Currency).where(Currency.name == item.name)):
        raise HTTPException(409, "Currency code or name already exists")
    db.add(item)
    db.flush()
    audit(
        db,
        actor_id=actor.id,
        action="currency.created",
        entity_type="currency",
        request_id=request.state.request_id,
        after=row(item),
    )
    db.commit()
    return row(item)


@router.patch("/currencies/{code}")
def update_currency(
    code: str,
    payload: CurrencyUpdate,
    request: Request,
    actor: User = Depends(require_permission("master_data.manage")),
    db: Session = Depends(get_db),
):
    item = db.get(Currency, code.upper())
    if not item:
        raise HTTPException(404, "Currency not found")
    before = row(item)
    changes = normalized(payload.model_dump(exclude_unset=True))
    for key, value in changes.items():
        setattr(item, key, value)
    audit(
        db,
        actor_id=actor.id,
        action="currency.updated",
        entity_type="currency",
        request_id=request.state.request_id,
        before=before,
        after=json_values(changes),
    )
    db.commit()
    return row(item)


@router.get("/payment-methods")
def payment_methods(
    response: Response,
    search: str = "",
    active: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=100),
    _: User = Depends(require_permission("master_data.read")),
    db: Session = Depends(get_db),
):
    return list_rows(db, PaymentMethod, search, active, page, page_size, response)


@router.post("/payment-methods", status_code=201)
def create_method(
    payload: PaymentMethodCreate,
    request: Request,
    actor: User = Depends(require_permission("master_data.manage")),
    db: Session = Depends(get_db),
):
    return create_reference(db, PaymentMethod, payload, request, actor, "payment_method")


@router.patch("/payment-methods/{item_id}")
def update_method(
    item_id: UUID,
    payload: PaymentMethodUpdate,
    request: Request,
    actor: User = Depends(require_permission("master_data.manage")),
    db: Session = Depends(get_db),
):
    return update_reference(db, PaymentMethod, item_id, payload, request, actor, "payment_method")


@router.delete("/payment-methods/{item_id}", status_code=204)
def delete_method(
    item_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("master_data.manage")),
    db: Session = Depends(get_db),
):
    delete_reference(db, PaymentMethod, item_id, request, actor, "payment_method")


@router.get("/document-types")
def document_types(
    response: Response,
    search: str = "",
    active: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=100),
    _: User = Depends(require_permission("master_data.read")),
    db: Session = Depends(get_db),
):
    return list_rows(db, DocumentType, search, active, page, page_size, response)


@router.post("/document-types", status_code=201)
def create_document_type(
    payload: DocumentTypeCreate,
    request: Request,
    actor: User = Depends(require_permission("master_data.manage")),
    db: Session = Depends(get_db),
):
    return create_reference(db, DocumentType, payload, request, actor, "document_type")


@router.patch("/document-types/{item_id}")
def update_document_type(
    item_id: UUID,
    payload: DocumentTypeUpdate,
    request: Request,
    actor: User = Depends(require_permission("master_data.manage")),
    db: Session = Depends(get_db),
):
    return update_reference(db, DocumentType, item_id, payload, request, actor, "document_type")


@router.delete("/document-types/{item_id}", status_code=204)
def delete_document_type(
    item_id: UUID,
    request: Request,
    actor: User = Depends(require_permission("master_data.manage")),
    db: Session = Depends(get_db),
):
    delete_reference(db, DocumentType, item_id, request, actor, "document_type")


@router.get("/vendors")
def vendors(
    response: Response,
    search: str = "",
    active_only: bool = True,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=100),
    _: User = Depends(require_permission("vendors.read")),
):
    items = get_vendor_adapter().list(search, active_only)
    response.headers["X-Total-Count"] = str(len(items))
    response.headers["X-Page"] = str(page)
    response.headers["X-Page-Size"] = str(page_size)
    return items[(page - 1) * page_size : page * page_size]


@router.get("/vendors/{vendor_id}")
def vendor(vendor_id: str, _: User = Depends(require_permission("vendors.read"))):
    item = get_vendor_adapter().get(vendor_id)
    if not item:
        raise HTTPException(404, "Vendor not found")
    return item
