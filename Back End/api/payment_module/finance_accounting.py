"""Account assignments around immutable, Decimal tax amounts."""

from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select

from .finance_configuration import reference
from .finance_readiness import effective, finance_date
from .models import ChartAccount, CostCenter, FinanceJournalSnapshot, PaymentRequestLine

COMPONENTS = (
    ("expense", "net_of_vat", "debit_account_id", "debit"),
    ("input_vat", "vat", "input_vat_account_id", "debit"),
    ("ewt_payable", "ewt", "ewt_payable_account_id", "credit"),
    ("vendor_payable", "amount_due", "credit_account_id", "credit"),
)


def latest_journal(db, request_id):
    return db.scalar(
        select(FinanceJournalSnapshot)
        .where(FinanceJournalSnapshot.request_id == request_id)
        .order_by(FinanceJournalSnapshot.version.desc())
        .limit(1)
    )


def build_entries(db, item, tax, overrides=None, strict=False):
    if tax is None or tax.request_version != item.version:
        raise HTTPException(409, "Save the EWT calculation for the current request before preparing accounting")
    result = tax.result
    mapping = (
        result["configuration"]
        .get("accounts_by_request_type", {})
        .get("cashAdvance" if item.request_type == "cashAdvance" else "general", {})
    )
    lines = {
        str(line.id): line
        for line in db.scalars(select(PaymentRequestLine).where(PaymentRequestLine.request_id == item.id))
    }
    if set(lines) != {row["line_id"] for row in result["lines"]}:
        raise HTTPException(409, "Request lines changed; recalculate EWT")
    overrides = overrides or {}
    entries, blockers, valid_keys = [], [], set()
    for row in result["lines"]:
        line = lines[row["line_id"]]
        center = db.get(CostCenter, line.cost_center_id) if line.cost_center_id else None
        if not effective(center, finance_date()) or center.department_id != item.department_id:
            blockers.append(f"Line {row['position']}: configure an active cost center for the request department")
        for component, amount_key, account_key, side in COMPONENTS:
            if item.request_type == "cashAdvance" and component == "expense":
                component = "advance"
            amount = Decimal(row[amount_key])
            if not amount.is_finite() or amount < 0:
                raise HTTPException(409, "Tax calculation contains an invalid accounting amount")
            if amount == 0:
                continue
            key = f"{row['line_id']}:{component}"
            valid_keys.add(key)
            account_id = overrides.get(key) or mapping.get(account_key)
            if not account_id and component == "expense":
                account_id = line.chart_account_id
            account = db.get(ChartAccount, UUID(str(account_id))) if account_id else None
            if not effective(account, finance_date()) or not account.is_posting:
                blockers.append(
                    f"Line {row['position']}: select an active posting account "
                    f"effective for {component.replace('_', ' ')}"
                )
            if component == "advance" and (not account or account.account_type != "asset"):
                blockers.append("Cash Advance must use an advance asset account")
            entries.append(
                {
                    "key": key,
                    "line_id": row["line_id"],
                    "position": row["position"],
                    "particulars": row["particulars"],
                    "component": component,
                    "account": reference(account) if account else None,
                    "cost_center": reference(center) if center else None,
                    "debit": str(amount if side == "debit" else Decimal(0)),
                    "credit": str(amount if side == "credit" else Decimal(0)),
                }
            )
        if item.request_type == "liquidation" and Decimal(row.get("advance_applied", "0")) > 0:
            source_account = result["advance_source"]["asset_account"]
            key = f"{row['line_id']}:advance_settlement"
            valid_keys.add(key)
            if key in overrides and str(overrides[key]) != source_account["id"]:
                raise HTTPException(422, "Liquidation must settle the original advance asset account")
            account = db.get(ChartAccount, UUID(source_account["id"]))
            if not effective(account, finance_date()) or not account.is_posting:
                blockers.append("The original advance asset account is inactive or expired")
            entries.append(
                {
                    "key": key,
                    "line_id": row["line_id"],
                    "position": row["position"],
                    "particulars": row["particulars"],
                    "component": "advance_settlement",
                    "account": source_account,
                    "cost_center": result["advance_source"]["asset_cost_center"],
                    "debit": "0",
                    "credit": row["advance_applied"],
                }
            )
    if (
        item.request_type == "cashAdvance"
        and len({row["account"]["id"] for row in entries if row["component"] == "advance" and row["account"]}) > 1
    ):
        blockers.append("Use one advance asset account across this Cash Advance")
    if set(overrides) - valid_keys:
        raise HTTPException(422, "Account correction references an entry outside the current calculation")
    debit = sum((Decimal(row["debit"]) for row in entries), Decimal(0))
    credit = sum((Decimal(row["credit"]) for row in entries), Decimal(0))
    if debit != credit or debit != item.gross_amount or not entries:
        blockers.append("Accounting must balance and reconcile to the request gross amount")
    if strict and blockers:
        raise HTTPException(409, "; ".join(dict.fromkeys(blockers)))
    return {
        "currency": item.currency_code,
        "tax_version": tax.version,
        "configuration_version": result["configuration"]["version"],
        "entries": entries,
        "account_overrides": {key: str(value) for key, value in overrides.items()},
        "totals": {"debit": str(debit), "credit": str(credit), "difference": str(debit - credit)},
        "tax_totals": result["totals"],
        "blockers": list(dict.fromkeys(blockers)),
    }


def validate_saved_entries(db, result):
    debit, credit = Decimal(0), Decimal(0)
    for entry in result["entries"]:
        account = db.get(ChartAccount, UUID(entry["account"]["id"])) if entry.get("account") else None
        center = db.get(CostCenter, UUID(entry["cost_center"]["id"])) if entry.get("cost_center") else None
        if not effective(account, finance_date()) or not account.is_posting or not effective(center, finance_date()):
            raise HTTPException(
                409, "An assigned account or cost center is no longer active; Finance Associate must correct the draft"
            )
        if entry["component"] == "advance" and account.account_type != "asset":
            raise HTTPException(409, "Cash Advance requires an advance asset account")
        entry_debit, entry_credit = Decimal(entry["debit"]), Decimal(entry["credit"])
        if (
            not entry_debit.is_finite()
            or not entry_credit.is_finite()
            or entry_debit < 0
            or entry_credit < 0
            or bool(entry_debit) == bool(entry_credit)
        ):
            raise HTTPException(409, "Each accounting entry must have one positive debit or credit")
        debit += entry_debit
        credit += entry_credit
    if (
        not debit
        or debit != credit
        or str(debit) != result["totals"]["debit"]
        or str(credit) != result["totals"]["credit"]
    ):
        raise HTTPException(409, "Saved accounting entries are not balanced")
