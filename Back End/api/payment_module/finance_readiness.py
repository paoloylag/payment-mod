"""Live checks for saved Finance defaults; this does not activate draft policy."""

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select

from .config import get_settings
from .models import ChartAccount, CostCenter, Department, TaxCode


def finance_date():
    return datetime.now(ZoneInfo(get_settings().database_timezone)).date()


def effective(record, on_date):
    return bool(
        record
        and record.is_active
        and (record.effective_from is None or record.effective_from <= on_date)
        and (record.effective_to is None or record.effective_to >= on_date)
    )


def readiness_report(db, draft, missing, request_types):
    today = finance_date()
    checks = []

    def add(code, label, passed, message, request_type=None):
        checks.append(
            {
                "code": code,
                "label": label,
                "status": "ready" if passed else "blocked",
                "message": message,
                "request_type": request_type,
            }
        )

    add(
        "choices",
        "Required Finance choices",
        not missing,
        "All draft choices are filled in." if not missing else "Complete the missing choices below.",
    )
    add(
        "effective_date",
        "Setup effective date",
        draft.effective_from is not None and draft.effective_from <= today,
        "Choose an effective date on or before today to prepare this setup for use.",
    )
    departments = list(db.scalars(select(Department).where(Department.is_active.is_(True))))
    centers = list(db.scalars(select(CostCenter)))
    missing_departments = [
        department.name
        for department in departments
        if not any(center.department_id == department.id and effective(center, today) for center in centers)
    ]
    add(
        "cost_centers",
        "Department cost centers",
        bool(departments) and not missing_departments,
        "Configure an active, effective cost center for: " + ", ".join(missing_departments)
        if missing_departments
        else "Active departments have effective cost centers."
        if departments
        else "Configure an active department first.",
    )
    for request_type in request_types:
        tax_id = draft.tax_by_request_type.get(request_type)
        tax = db.get(TaxCode, tax_id) if tax_id else None
        add(
            f"{request_type}.tax",
            "Tax code",
            effective(tax, today),
            "The selected tax code must exist, be active, and be effective today.",
            request_type,
        )
        mapping = draft.accounts_by_request_type.get(request_type)
        for side in ("debit", "credit"):
            account_id = getattr(mapping, f"{side}_account_id", None)
            account = db.get(ChartAccount, account_id) if account_id else None
            add(
                f"{request_type}.{side}",
                f"{side.title()} account",
                effective(account, today) and account.is_posting,
                "The selected account must be active, posting, and effective today.",
                request_type,
            )
        add(
            f"{request_type}.accounts_distinct",
            "Distinct debit and credit accounts",
            bool(
                mapping
                and mapping.debit_account_id
                and mapping.credit_account_id
                and mapping.debit_account_id != mapping.credit_account_id
            ),
            "Choose different debit and credit accounts.",
            request_type,
        )
    add(
        "certification",
        "Voucher certification wording",
        bool(draft.voucher.certification_text.strip()),
        "Enter certification wording containing more than whitespace.",
    )
    checks.append(
        {
            "code": "activation",
            "label": "Finance policy activation",
            "status": "pending_confirmation",
            "message": "Finance must confirm vendor/line tax applicability, mapping exceptions, and sign-off scope "
            "before automatic accounting and the full request gate can be activated.",
            "request_type": None,
        }
    )
    return {
        "as_of": today.isoformat(),
        "configuration_version": draft.version,
        "ready": False,
        "enforced": False,
        "operational_status": "draft",
        "checks": checks,
        "missing_choices": missing,
        "blocked_count": sum(check["status"] == "blocked" for check in checks),
        "pending_confirmation_count": 1,
    }
