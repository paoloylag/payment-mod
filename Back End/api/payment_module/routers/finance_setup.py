"""Versioned Finance setup choices awaiting calculation and voucher activation."""

import json
from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..database import get_db
from ..finance_readiness import readiness_report
from ..models import ChartAccount, SystemSetting, TaxCode, User
from ..security import current_user

router = APIRouter(prefix="/api/v1/request-settings", tags=["finance setup"])
SETTING_KEY = "finance.setup.draft"
REQUEST_TYPES = ("reimbursement", "cashAdvance", "liquidation", "poPayment", "general")


class AccountMapping(BaseModel):
    debit_account_id: UUID | None = None
    credit_account_id: UUID | None = None


class VoucherOptions(BaseModel):
    prefix: str = Field(default="", max_length=12, pattern=r"^[A-Z0-9-]*$")
    reset_basis: Literal["academic_year", "calendar_year", "continuous"] | None = None
    certification_text: str = Field(default="", max_length=1000)
    create_role: Literal["finance_associate", "finance_manager"] | None = None
    post_role: Literal["finance_manager"] | None = None
    void_role: Literal["finance_manager"] | None = None


class FinanceSetupDraft(BaseModel):
    version: int = Field(default=0, ge=0)
    vat_basis: Literal["inclusive", "exclusive"] | None = None
    ewt_basis: Literal["net_of_vat", "gross"] | None = None
    rounding: Literal["half_up", "half_even"] | None = None
    effective_date_basis: Literal["submission", "finance_review"] | None = None
    effective_from: date | None = None
    tax_by_request_type: dict[str, UUID | None] = Field(default_factory=dict)
    accounts_by_request_type: dict[str, AccountMapping] = Field(default_factory=dict)
    voucher: VoucherOptions = Field(default_factory=VoucherOptions)
    setup_scope: Literal["system", "request_type", "department"] | None = None


def read_draft(db: Session) -> FinanceSetupDraft:
    setting = db.scalar(select(SystemSetting).where(SystemSetting.key == SETTING_KEY))
    return FinanceSetupDraft.model_validate(json.loads(setting.value)) if setting else FinanceSetupDraft()


def missing_choices(draft: FinanceSetupDraft) -> list[str]:
    missing = []
    for field, label in (
        ("vat_basis", "VAT basis"), ("ewt_basis", "EWT basis"), ("rounding", "Rounding method"),
        ("effective_date_basis", "Effective date basis"), ("effective_from", "Effective from date"),
        ("setup_scope", "Setup sign-off scope"),
    ):
        if getattr(draft, field) is None:
            missing.append(label)
    for request_type in REQUEST_TYPES:
        if draft.tax_by_request_type.get(request_type) is None:
            missing.append(f"{request_type}: tax code")
        mapping = draft.accounts_by_request_type.get(request_type)
        if not mapping or mapping.debit_account_id is None or mapping.credit_account_id is None:
            missing.append(f"{request_type}: debit and credit accounts")
    for field, label in (
        ("prefix", "Voucher prefix"), ("reset_basis", "Voucher numbering period"),
        ("certification_text", "Voucher certification text"), ("create_role", "Voucher creator role"),
        ("post_role", "Voucher posting role"), ("void_role", "Voucher voiding role"),
    ):
        if not getattr(draft.voucher, field):
            missing.append(label)
    return missing


def view(draft: FinanceSetupDraft, db: Session) -> dict:
    return {
        **draft.model_dump(mode="json"),
        "missing_choices": missing_choices(draft),
        "configuration_complete": not missing_choices(draft),
        "operational_status": "draft",
        "general_ewt_configured": bool(draft.tax_by_request_type.get("general")),
        "readiness": readiness_report(db, draft, missing_choices(draft), REQUEST_TYPES),
    }


@router.get("/finance-setup")
def get_finance_setup(db: Session = Depends(get_db), actor: User = Depends(current_user)):
    return view(read_draft(db), db)


@router.put("/finance-setup")
def update_finance_setup(
    payload: FinanceSetupDraft, request: Request,
    db: Session = Depends(get_db), actor: User = Depends(current_user),
):
    if "requests.numbering.manage" not in getattr(request.state, "permissions", set()):
        raise HTTPException(403, "Permission required: requests.numbering.manage")
    unknown = (set(payload.tax_by_request_type) | set(payload.accounts_by_request_type)) - set(REQUEST_TYPES)
    if unknown:
        raise HTTPException(422, f"Unsupported request type: {', '.join(sorted(unknown))}")
    for tax_id in payload.tax_by_request_type.values():
        if tax_id is not None:
            tax = db.get(TaxCode, tax_id)
            if tax is None or not tax.is_active:
                raise HTTPException(422, "Selected tax code must be active")
    for mapping in payload.accounts_by_request_type.values():
        for account_id in (mapping.debit_account_id, mapping.credit_account_id):
            if account_id is not None:
                account = db.get(ChartAccount, account_id)
                if account is None or not account.is_active or not account.is_posting:
                    raise HTTPException(422, "Selected account must be active and posting")
    setting = db.scalar(select(SystemSetting).where(SystemSetting.key == SETTING_KEY).with_for_update())
    before = read_draft(db)
    if payload.version != before.version:
        raise HTTPException(409, "Finance setup changed; reload before saving")
    saved = payload.model_copy(update={"version": before.version + 1})
    if setting is None:
        setting = SystemSetting(key=SETTING_KEY, value=saved.model_dump_json())
        db.add(setting)
    else:
        setting.value = saved.model_dump_json()
    db.flush()
    audit(
        db, actor_id=actor.id, action="finance_setup_draft.updated", entity_type="system_setting",
        entity_id=setting.id, request_id=request.state.request_id,
        before=before.model_dump(mode="json"), after=saved.model_dump(mode="json"),
    )
    db.commit()
    return view(saved, db)
