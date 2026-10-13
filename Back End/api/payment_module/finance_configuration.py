"""General-request configuration activation and automatic account mapping."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, text

from .finance_readiness import effective, finance_date
from .models import ChartAccount, CostCenter, FinanceCodingSnapshot, FinanceConfiguration, PaymentRequestLine, TaxCode


def lock_configuration(db, shared=False):
    function = "pg_advisory_xact_lock_shared" if shared else "pg_advisory_xact_lock"
    db.execute(text(f"SELECT {function}(hashtext('finance.configuration'))"))


def active_configuration(db):
    return db.scalar(
        select(FinanceConfiguration)
        .where(FinanceConfiguration.effective_from <= finance_date())
        .order_by(FinanceConfiguration.version.desc())
        .limit(1)
    )


def reference(record):
    return {"id": str(record.id), "code": record.code, "name": record.name}


def activation_errors(db, config):
    errors = []
    for field in ("vat_basis", "ewt_basis", "rounding", "effective_date_basis", "effective_from", "setup_scope"):
        if not config.get(field):
            errors.append(f"Set {field.replace('_', ' ')}")
    if config.get("setup_scope") == "department":
        errors.append("Department-specific activation is not available; select per request type or system scope")
    from datetime import date

    on_date = (
        max(finance_date(), date.fromisoformat(config["effective_from"]))
        if config.get("effective_from")
        else finance_date()
    )
    tax_id = config.get("tax_by_request_type", {}).get("general")
    tax = db.get(TaxCode, UUID(str(tax_id))) if tax_id else None
    if not effective(tax, on_date):
        errors.append("Select an active General tax code effective on the activation date")
    # The request amount is the approval basis. Do not introduce unapproved VAT additions.
    if tax and tax.vat_rate and config.get("vat_basis") == "exclusive":
        errors.append(
            "VAT-exclusive additions are not supported by the current approval amount; use VAT-inclusive amounts"
        )
    mapping = config.get("accounts_by_request_type", {}).get("general", {})
    for side in ("debit", "credit"):
        account_id = mapping.get(f"{side}_account_id")
        account = db.get(ChartAccount, UUID(str(account_id))) if account_id else None
        if not effective(account, on_date) or not account.is_posting:
            errors.append(f"Select an active, effective posting {side} account for General requests")
    if mapping.get("debit_account_id") == mapping.get("credit_account_id"):
        errors.append("Debit and credit accounts must be different")
    return errors


def mapping_for_department(db, configuration, department_id):
    config = configuration.configuration
    on_date = finance_date()
    tax = db.get(TaxCode, UUID(config["tax_by_request_type"]["general"]))
    if not effective(tax, on_date):
        raise HTTPException(409, "Finance setup is incomplete: General tax code is inactive or expired")
    mapping = config["accounts_by_request_type"]["general"]
    accounts = {}
    for side in ("debit", "credit"):
        account = db.get(ChartAccount, UUID(mapping[f"{side}_account_id"]))
        if not effective(account, on_date) or not account.is_posting:
            raise HTTPException(409, f"Finance setup is incomplete: General {side} account is inactive or expired")
        accounts[side] = account
    center = db.scalar(select(CostCenter).where(CostCenter.department_id == department_id))
    if not effective(center, on_date):
        raise HTTPException(409, "Finance setup is incomplete: configure an effective cost center for this department")
    return accounts, center


def required_configuration(db, request_type):
    if request_type != "general":
        return None
    lock_configuration(db, shared=True)
    configuration = active_configuration(db)
    if not configuration and db.scalar(select(FinanceConfiguration.id).limit(1)):
        raise HTTPException(409, "General Finance configuration is scheduled but not yet effective")
    return configuration


def apply_payload(db, payload):
    configuration = required_configuration(db, payload.request_type)
    if not configuration:
        return payload, None
    accounts, center = mapping_for_department(db, configuration, payload.department_id)
    lines = [
        line.model_copy(update={"chart_account_id": accounts["debit"].id, "cost_center_id": center.id})
        for line in payload.lines
    ]
    return payload.model_copy(update={"lines": lines}), configuration


def apply_submission(db, item):
    configuration = required_configuration(db, item.request_type)
    if configuration:
        accounts, center = mapping_for_department(db, configuration, item.department_id)
        for line in db.scalars(select(PaymentRequestLine).where(PaymentRequestLine.request_id == item.id)):
            line.chart_account_id = accounts["debit"].id
            line.cost_center_id = center.id
        db.flush()
    return configuration


def save_coding(db, item, configuration):
    if not configuration:
        return
    accounts, center = mapping_for_department(db, configuration, item.department_id)
    lines = list(
        db.scalars(
            select(PaymentRequestLine)
            .where(PaymentRequestLine.request_id == item.id)
            .order_by(PaymentRequestLine.position)
        )
    )
    db.add(
        FinanceCodingSnapshot(
            request_id=item.id,
            request_version=item.version,
            configuration_id=configuration.id,
            result={
                "configuration_version": configuration.version,
                "configuration": configuration.configuration,
                "currency": item.currency_code,
                "debit": reference(accounts["debit"]),
                "credit": reference(accounts["credit"]),
                "cost_center": reference(center),
                "lines": [
                    {
                        "line_id": str(line.id),
                        "position": line.position,
                        "amount": str(line.amount),
                        "particulars": line.particulars,
                    }
                    for line in lines
                ],
            },
        )
    )
    db.flush()


def request_coding(db, item):
    return db.scalar(
        select(FinanceCodingSnapshot).where(
            FinanceCodingSnapshot.request_id == item.id, FinanceCodingSnapshot.request_version == item.version
        )
    )
