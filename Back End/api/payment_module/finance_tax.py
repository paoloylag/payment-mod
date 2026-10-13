"""Decimal-only EWT calculation. EWT overrides never change VAT classification."""

from datetime import date
from decimal import ROUND_HALF_EVEN, ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select

from .config import get_settings
from .finance_readiness import effective, finance_date
from .models import Currency, FinanceTaxSnapshot, PaymentRequestLine, TaxCode


def latest_snapshot(db, request_id):
    return db.scalar(
        select(FinanceTaxSnapshot)
        .where(FinanceTaxSnapshot.request_id == request_id)
        .order_by(FinanceTaxSnapshot.version.desc())
        .limit(1)
    )


def tax_details(tax):
    return {
        "id": str(tax.id),
        "code": tax.code,
        "name": tax.name,
        "vat_rate": str(tax.vat_rate),
        "vat_classification": tax.vat_classification,
        "ewt_rate": str(tax.ewt_rate),
        "ewt_classification": tax.ewt_classification,
    }


def calculate(lines, config, vat_tax, request_tax, overrides, precision):
    quantum = Decimal(1).scaleb(-precision)
    rounding = ROUND_HALF_UP if config["rounding"] == "half_up" else ROUND_HALF_EVEN

    def money(value):
        return value.quantize(quantum, rounding=rounding)

    results = []
    for line in lines:
        amount = money(line.amount)
        vat_rate = Decimal(vat_tax["vat_rate"]) / 100
        base = money(amount / (1 + vat_rate)) if config["vat_basis"] == "inclusive" else amount
        vat = amount - base if config["vat_basis"] == "inclusive" else money(base * vat_rate)
        gross = base + vat
        tax = overrides.get(str(line.id), request_tax)
        ewt_base = base if config["ewt_basis"] == "net_of_vat" else gross
        ewt = money(ewt_base * Decimal(tax["ewt_rate"]) / 100)
        results.append(
            {
                "line_id": str(line.id),
                "position": line.position,
                "particulars": line.particulars,
                "source": "line" if str(line.id) in overrides else "request",
                "ewt_tax": tax,
                "input_amount": str(amount),
                "net_of_vat": str(base),
                "vat": str(vat),
                "gross": str(gross),
                "ewt_base": str(ewt_base),
                "ewt": str(ewt),
                "amount_due": str(gross - ewt),
            }
        )
    totals = {
        key: str(sum((Decimal(row[key]) for row in results), Decimal(0)))
        for key in ("input_amount", "net_of_vat", "vat", "gross", "ewt", "amount_due")
    }
    return {"lines": results, "totals": totals, "vat_tax": vat_tax, "request_ewt_tax": request_tax}


def build_calculation(db, item, config, request_tax_id=None, line_overrides=None):
    today = finance_date()
    if any(
        not config.get(field)
        for field in ("vat_basis", "ewt_basis", "rounding", "effective_from", "effective_date_basis")
    ):
        raise HTTPException(409, "Finance must configure VAT basis, EWT basis, rounding, and rule dates first")
    rule_date = (
        item.submitted_at.astimezone(ZoneInfo(get_settings().database_timezone)).date()
        if config["effective_date_basis"] == "submission" and item.submitted_at
        else today
    )
    if config.get("calculation_reference_date"):
        rule_date = date.fromisoformat(config["calculation_reference_date"])
    config = {**config, "calculation_reference_date": rule_date.isoformat()}
    if str(config["effective_from"]) > rule_date.isoformat():
        raise HTTPException(409, "Finance setup is not yet effective")
    default_id = config.get("tax_by_request_type", {}).get("general")
    if not default_id:
        raise HTTPException(409, "Finance must configure the General request default tax code first")

    def get_tax(tax_id):
        tax = db.get(TaxCode, tax_id)
        if not effective(tax, rule_date):
            raise HTTPException(422, "Selected tax code must be active and effective")
        return tax_details(tax)

    vat_tax = get_tax(default_id)
    request_tax = get_tax(request_tax_id or default_id)
    lines = list(
        db.scalars(
            select(PaymentRequestLine)
            .where(PaymentRequestLine.request_id == item.id)
            .order_by(PaymentRequestLine.position)
        )
    )
    if not lines or any(line.amount <= 0 or line.currency_code != item.currency_code for line in lines):
        raise HTTPException(409, "Positive request lines in the request currency are required")
    overrides = line_overrides or {}
    if set(overrides) - {str(line.id) for line in lines}:
        raise HTTPException(422, "EWT override references a line outside this request")
    currency = db.get(Currency, item.currency_code)
    if currency is None or not currency.is_active:
        raise HTTPException(409, "Request currency must be active")
    result = calculate(
        lines,
        config,
        vat_tax,
        request_tax,
        {key: get_tax(value) for key, value in overrides.items()},
        currency.decimal_precision,
    )
    if Decimal(result["totals"]["gross"]) != item.gross_amount:
        raise HTTPException(
            409,
            "Calculated gross must match the approved request amount. "
            "VAT-exclusive additions require correction of the request before tax assignment.",
        )
    return {
        **result,
        "configuration": config,
        "currency": item.currency_code,
        "request_ewt_tax_id": str(request_tax_id) if request_tax_id else None,
        "line_ewt_overrides": {key: str(value) for key, value in overrides.items()},
        "calculated_on": today.isoformat(),
    }
