"""Read-only Phase 05 route preview while workflow persistence is developed."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..security import current_user
from ..workflow_policy import PolicyCannotRoute, route_for
from .requests import get_visible

router = APIRouter(prefix="/api/v1/workflow", tags=["workflow"])


@router.get("/preview/{request_id}")
def preview_route(
    request_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    item = get_visible(db, request, actor, request_id)
    try:
        route = route_for(
            request_type=item.request_type,
            budgeted=(item.type_data or {}).get("budgeted") is not False,
            amount=item.gross_amount,
            currency_code=item.currency_code,
        )
    except PolicyCannotRoute as error:
        raise HTTPException(422, str(error)) from error
    return {
        "policy_version": route.policy_version,
        "provisional": True,
        "request_id": str(item.id),
        "request_type": route.request_type,
        "budgeted": route.budgeted,
        "amount": str(route.amount),
        "currency_code": route.currency_code,
        "stages": [{"code": stage.code, "role": stage.role, "purpose": stage.purpose} for stage in route.stages],
    }
