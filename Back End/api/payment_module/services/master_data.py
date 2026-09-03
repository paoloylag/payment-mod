from datetime import date
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import ChartAccount


def normalized(payload: dict) -> dict:
    values = dict(payload)
    if "code" in values and values["code"] is not None:
        values["code"] = values["code"].strip().upper()
    for field in ("name", "description", "bank_name", "account_name", "branch", "category"):
        if field in values and isinstance(values[field], str):
            values[field] = values[field].strip()
    for field in ("effective_from", "effective_to"):
        if values.get(field) and isinstance(values[field], str):
            try:
                values[field] = date.fromisoformat(values[field])
            except ValueError as error:
                raise HTTPException(422, f"{field} must use YYYY-MM-DD") from error
    if (
        values.get("effective_from")
        and values.get("effective_to")
        and values["effective_to"] < values["effective_from"]
    ):
        raise HTTPException(422, "effective_to cannot be earlier than effective_from")
    return values


def ensure_unique(db: Session, model, code: str, name: str, current_id: UUID | None = None) -> None:
    query = select(model).where((model.code == code) | (model.name == name))
    if current_id:
        query = query.where(model.id != current_id)
    if db.scalar(query):
        raise HTTPException(409, "Code or name already exists")


def ensure_account_parent(db: Session, account_id: UUID | None, parent_id: UUID | None) -> None:
    if not parent_id:
        return
    if account_id == parent_id or not db.get(ChartAccount, parent_id):
        raise HTTPException(422, "Invalid parent account")
    visited = {account_id} if account_id else set()
    current = parent_id
    while current:
        if current in visited:
            raise HTTPException(422, "Account hierarchy would contain a cycle")
        visited.add(current)
        parent = db.get(ChartAccount, current)
        current = parent.parent_id if parent else None
