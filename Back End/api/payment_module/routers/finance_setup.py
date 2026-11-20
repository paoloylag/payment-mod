"""Versioned Finance setup choices awaiting calculation and voucher activation."""

import json
from datetime import UTC, date, datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..database import get_db
from ..finance_configuration import activation_errors, active_configuration, lock_configuration, reference
from ..finance_readiness import readiness_report
from ..finance_tax import tax_details
from ..models import ChartAccount, FinanceConfiguration, Role, SystemSetting, TaxCode, User, UserRole
from ..security import current_user

router = APIRouter(prefix="/api/v1/request-settings", tags=["finance setup"])
SETTING_KEY = "finance.setup.draft"
REQUEST_TYPES = ("reimbursement", "cashAdvance", "liquidation", "poPayment", "general")
REVIEW_AREAS = {"documents", "approvals", "accounting", "payments", "liquidation", "voucher_print"}


def initial_setup_status(db, draft, active):
    missing = missing_choices(draft, "all")
    report = readiness_report(db, draft, missing, REQUEST_TYPES, "all")
    blockers = activation_errors(db, draft.model_dump(mode="json"), "all") + missing
    blockers += [check["message"] for check in report["checks"] if check["status"] == "blocked"]
    if draft.voucher.create_role != "finance_associate":
        blockers.append("Voucher creator must be Finance Associate")
    acceptance = (
        db.scalar(select(SystemSetting).where(SystemSetting.key == f"finance.business_acceptance.{active.version}"))
        if active
        else None
    )
    accepted = json.loads(acceptance.value) if acceptance else None
    current = bool(active and active.version == draft.version and active.configuration.get("scope") == "all")
    return {
        "status": "changes_pending"
        if active and active.version != draft.version
        else "complete"
        if current and accepted and not blockers
        else "business_review"
        if current and not blockers
        else "configuration",
        "configuration_ready": not blockers,
        "blockers": list(dict.fromkeys(blockers)),
        "current_all_activation": current,
        "acceptance": accepted,
        "review_record_visible": True,
        "review_areas": sorted(REVIEW_AREAS),
    }


class AccountMapping(BaseModel):
    debit_account_id: UUID | None = None
    credit_account_id: UUID | None = None
    input_vat_account_id: UUID | None = None
    ewt_payable_account_id: UUID | None = None


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


def missing_choices(draft: FinanceSetupDraft, scope="general") -> list[str]:
    missing = []
    for field, label in (
        ("vat_basis", "VAT basis"),
        ("ewt_basis", "EWT basis"),
        ("rounding", "Rounding method"),
        ("effective_date_basis", "Effective date basis"),
        ("effective_from", "Effective from date"),
        ("setup_scope", "Setup sign-off scope"),
    ):
        if getattr(draft, field) is None:
            missing.append(label)
    for request_type in REQUEST_TYPES if scope != "all" else ("general", "cashAdvance"):
        if request_type != "cashAdvance" or scope != "all":
            if draft.tax_by_request_type.get(request_type) is None:
                missing.append(f"{request_type}: tax code")
        mapping = draft.accounts_by_request_type.get(request_type)
        if not mapping or mapping.debit_account_id is None or mapping.credit_account_id is None:
            missing.append(f"{request_type}: debit and credit accounts")
    for field, label in (
        ("prefix", "Voucher prefix"),
        ("reset_basis", "Voucher numbering period"),
        ("certification_text", "Voucher certification text"),
        ("create_role", "Voucher creator role"),
        ("post_role", "Voucher posting role"),
        ("void_role", "Voucher voiding role"),
    ):
        if not getattr(draft.voucher, field):
            missing.append(label)
    return missing


def view(draft: FinanceSetupDraft, db: Session) -> dict:
    configurations = list(db.scalars(select(FinanceConfiguration).order_by(FinanceConfiguration.version.desc())))
    active = active_configuration(db)
    scope = active.configuration.get("scope", "general") if active else "general"
    missing = missing_choices(draft, scope)

    def activation_view(item):
        return {
            "version": item.version,
            "effective_from": item.effective_from.isoformat(),
            "reason": item.reason,
            "activated_by": item.configuration["activated_by"],
            "created_at": item.created_at.isoformat(),
            "debit": item.configuration["debit"],
            "credit": item.configuration["credit"],
            "configuration": item.configuration,
        }

    return {
        **draft.model_dump(mode="json"),
        "initial_setup": initial_setup_status(db, draft, active),
        "missing_choices": missing,
        "configuration_complete": not missing,
        "operational_status": ("all_active" if scope == "all" else "general_active") if active else "draft",
        "general_ewt_configured": bool(draft.tax_by_request_type.get("general")),
        "readiness": readiness_report(db, draft, missing, REQUEST_TYPES, scope),
        "activation": {
            "scope": active.configuration.get("scope", "general") if active else "general",
            "all_type_blockers": activation_errors(db, draft.model_dump(mode="json"), "all"),
            "active": activation_view(active) if active else None,
            "latest_version": configurations[0].version if configurations else 0,
            "history": [activation_view(item) for item in configurations],
            "blockers": activation_errors(db, draft.model_dump(mode="json")),
            "draft_already_activated": any(item.version == draft.version for item in configurations),
        },
    }


@router.get("/finance-setup")
def get_finance_setup(db: Session = Depends(get_db), actor: User = Depends(current_user)):
    result = view(read_draft(db), db)
    roles = set(db.scalars(select(Role.code).join(UserRole).where(UserRole.user_id == actor.id)))
    if not roles.intersection({"finance_associate", "finance_manager", "system_administrator"}):
        result["initial_setup"]["acceptance"] = None
        result["initial_setup"]["review_record_visible"] = False
    return result


class BusinessAcceptance(BaseModel):
    model_config = ConfigDict(extra="forbid")
    configuration_version: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=2000)
    reviewed_areas: dict[str, bool]


@router.post("/finance-setup/business-acceptance")
def accept_business_setup(
    payload: BusinessAcceptance, request: Request, db: Session = Depends(get_db), actor: User = Depends(current_user)
):
    roles = set(db.scalars(select(Role.code).join(UserRole).where(UserRole.user_id == actor.id)))
    if "finance_manager" not in roles or "requests.numbering.manage" not in getattr(
        request.state, "permissions", set()
    ):
        raise HTTPException(403, "Finance Manager must record business acceptance")
    if (
        set(payload.reviewed_areas) != REVIEW_AREAS
        or not all(payload.reviewed_areas.values())
        or not payload.reason.strip()
    ):
        raise HTTPException(422, "Confirm all six review areas and provide an acceptance note")
    lock_configuration(db)
    draft, active = read_draft(db), active_configuration(db)
    if not active or active.version != payload.configuration_version:
        raise HTTPException(409, "Active configuration changed; refresh the setup")
    status = initial_setup_status(db, draft, active)
    if not status["current_all_activation"] or status["blockers"]:
        raise HTTPException(409, "Save and activate a complete, effective All request types setup before acceptance")
    key = f"finance.business_acceptance.{active.version}"
    previous = db.scalar(select(SystemSetting).where(SystemSetting.key == key))
    result = {
        "configuration_version": active.version,
        "reviewer_id": str(actor.id),
        "reviewer": actor.display_name,
        "accepted_at": datetime.now(UTC).isoformat(),
        "reason": payload.reason.strip(),
        "reviewed_areas": payload.reviewed_areas,
    }
    if previous:
        saved = json.loads(previous.value)
        if (
            saved["reviewer_id"] != str(actor.id)
            or saved["reason"] != result["reason"]
            or saved["reviewed_areas"] != payload.reviewed_areas
        ):
            raise HTTPException(409, "Business acceptance is already recorded for this version")
        return view(draft, db)
    db.add(SystemSetting(key=key, value=json.dumps(result)))
    audit(
        db,
        actor_id=actor.id,
        action="finance.business_acceptance_recorded",
        entity_type="finance_configuration",
        entity_id=active.id,
        request_id=request.state.request_id,
        after=result,
    )
    db.commit()
    return view(draft, db)


@router.put("/finance-setup")
def update_finance_setup(
    payload: FinanceSetupDraft,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    if "requests.numbering.manage" not in getattr(request.state, "permissions", set()):
        raise HTTPException(403, "Permission required: requests.numbering.manage")
    lock_configuration(db)
    unknown = (set(payload.tax_by_request_type) | set(payload.accounts_by_request_type)) - set(REQUEST_TYPES)
    if unknown:
        raise HTTPException(422, f"Unsupported request type: {', '.join(sorted(unknown))}")
    for tax_id in payload.tax_by_request_type.values():
        if tax_id is not None:
            tax = db.get(TaxCode, tax_id)
            if tax is None or not tax.is_active:
                raise HTTPException(422, "Selected tax code must be active")
    for mapping in payload.accounts_by_request_type.values():
        for account_id in (
            mapping.debit_account_id,
            mapping.credit_account_id,
            mapping.input_vat_account_id,
            mapping.ewt_payable_account_id,
        ):
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
        db,
        actor_id=actor.id,
        action="finance_setup_draft.updated",
        entity_type="system_setting",
        entity_id=setting.id,
        request_id=request.state.request_id,
        before=before.model_dump(mode="json"),
        after=saved.model_dump(mode="json"),
    )
    db.commit()
    return view(saved, db)


class ActivationPayload(BaseModel):
    scope: Literal["general", "all"] = "general"
    draft_version: int = Field(ge=1)
    expected_previous_version: int = Field(ge=0)
    reason: str = Field(min_length=1, max_length=2000)


@router.post("/finance-setup/activate")
def activate_setup(
    payload: ActivationPayload,
    request: Request,
    idempotency_key: str = Header(min_length=1, max_length=100),
    db: Session = Depends(get_db),
    actor: User = Depends(current_user),
):
    roles = set(
        db.scalars(select(Role.code).join(UserRole, UserRole.role_id == Role.id).where(UserRole.user_id == actor.id))
    )
    if "requests.numbering.manage" not in getattr(request.state, "permissions", set()) or not roles.intersection(
        {"finance_manager", "system_administrator"}
    ):
        raise HTTPException(403, "Only Finance Manager or System Administrator may activate Finance setup")
    lock_configuration(db)
    previous = db.scalar(select(FinanceConfiguration).where(FinanceConfiguration.command_key == idempotency_key))
    draft = read_draft(db)
    if previous:
        if (
            previous.version != payload.draft_version
            or previous.reason != payload.reason.strip()
            or previous.actor_user_id != actor.id
            or previous.configuration["activation_expected_version"] != payload.expected_previous_version
            or previous.configuration.get("scope", "general") != payload.scope
        ):
            raise HTTPException(409, "Idempotency key already used for another activation")
        return view(draft, db)
    latest = db.scalar(select(FinanceConfiguration).order_by(FinanceConfiguration.version.desc()).limit(1))
    if draft.version != payload.draft_version or (latest.version if latest else 0) != payload.expected_previous_version:
        raise HTTPException(409, "Finance setup or activation changed; reload before activating")
    if latest and latest.version >= draft.version:
        raise HTTPException(409, "This draft was already activated; save a new draft version first")
    if not payload.reason.strip():
        raise HTTPException(422, "Activation reason is required")
    config = draft.model_dump(mode="json")
    errors = activation_errors(db, config, payload.scope)
    if errors:
        raise HTTPException(409, "Finance setup is incomplete: " + "; ".join(errors))
    mapping = config["accounts_by_request_type"]["general"]
    config.update(
        {
            "activated_by": actor.display_name,
            "activation_expected_version": payload.expected_previous_version,
            "scope": payload.scope,
            "debit": reference(db.get(ChartAccount, UUID(mapping["debit_account_id"]))),
            "credit": reference(db.get(ChartAccount, UUID(mapping["credit_account_id"]))),
            "default_tax_snapshot": tax_details(db.get(TaxCode, UUID(config["tax_by_request_type"]["general"]))),
        }
    )
    activated = FinanceConfiguration(
        version=draft.version,
        effective_from=draft.effective_from,
        configuration=config,
        reason=payload.reason.strip(),
        command_key=idempotency_key,
        actor_user_id=actor.id,
    )
    db.add(activated)
    db.flush()
    audit(
        db,
        actor_id=actor.id,
        action="finance.configuration_activated",
        entity_type="finance_configuration",
        entity_id=activated.id,
        request_id=request.state.request_id,
        after=config,
    )
    db.commit()
    return view(draft, db)
