"""Derived payment balances and immutable per-payment state."""

from decimal import Decimal

from sqlalchemy import select

from .fund_returns import latest_return, receipt_available, return_amounts, return_view
from .models import (
    Currency,
    Document,
    DocumentVersion,
    FinanceJournalSnapshot,
    FinanceVoucherDraft,
    FinanceVoucherEvent,
    FundReturnEvent,
    PaymentEvidence,
    PaymentInstruction,
    PaymentLineEvent,
    PaymentMethod,
    PaymentRequest,
)
from .voucher_service import latest_voucher_event

ACTIVE_STATES = {
    "prepared",
    "authorized",
    "ready_for_pickup",
    "released",
    "cleared",
    "recovery_pending",
    "recovery_pending_cleared",
}


def balance_state(state, event):
    return (
        "recovery_pending_cleared"
        if state == "recovery_pending" and event.result.get("prior_state") == "cleared"
        else state
    )


def recovery_blocker(db, item):
    if item.request_type != "cashAdvance":
        return None
    for candidate in db.scalars(
        select(PaymentRequest).where(
            PaymentRequest.request_type == "liquidation",
            PaymentRequest.type_data["cash_advance_reference"].astext == item.request_number,
        )
    ):
        journal = db.scalar(
            select(FinanceJournalSnapshot)
            .where(FinanceJournalSnapshot.request_id == candidate.id)
            .order_by(FinanceJournalSnapshot.version.desc())
            .limit(1)
        )
        if journal and journal.state == "posted":
            return "This advance has posted Liquidation accounting; resolve its settlement before payment recovery"
    return None


def latest_line_event(db, instruction_id):
    return db.scalar(
        select(PaymentLineEvent)
        .where(PaymentLineEvent.instruction_id == instruction_id)
        .order_by(PaymentLineEvent.version.desc())
        .limit(1)
    )


def line_state(db, instruction):
    voucher = latest_voucher_event(db, instruction.voucher_id)
    event = latest_line_event(db, instruction.id)
    if voucher and voucher.state == "voided":
        return "voided", event.version if event else 0
    if event:
        return event.state, event.version
    return ("authorized" if voucher and voucher.state == "authorized" else "prepared"), 0


def event_view(row):
    return {
        "id": str(row.id),
        "instruction_id": str(row.instruction_id),
        "version": row.version,
        "state": row.state,
        "reason": row.reason,
        "result": row.result,
        "actor_user_id": str(row.actor_user_id),
        "created_at": row.created_at.isoformat(),
    }


def evidence_view(db, evidence):
    version = db.get(DocumentVersion, evidence.document_version_id)
    document = db.get(Document, version.document_id) if version else None
    return {
        "id": str(evidence.id),
        "kind": evidence.kind,
        "document_id": str(version.document_id) if version else None,
        "document_version_id": str(evidence.document_version_id),
        "filename": version.original_filename if version else "Unavailable",
        "sha256": version.sha256 if version else None,
        "available": bool(version and version.state == "available" and document and not document.removed_at),
        "created_at": evidence.created_at.isoformat(),
    }


def payment_summary(db, voucher):
    rows = list(
        db.scalars(
            select(PaymentInstruction)
            .where(PaymentInstruction.voucher_id == voucher.id)
            .order_by(PaymentInstruction.sequence)
        )
    )
    states = {row.id: balance_state(line_state(db, row)[0], latest_line_event(db, row.id)) for row in rows}
    return balance_summary(voucher, rows, states, latest_voucher_event(db, voucher.id), latest_return(db, voucher.id))


def balance_summary(voucher, rows, states, latest, fund_return=None):
    states = {row.id: states[row.id] for row in rows}
    due = Decimal(voucher.result["totals"]["amount_due"])
    reserved = sum((row.amount for row in rows if states[row.id] in ACTIVE_STATES), Decimal(0))
    released = sum(
        (
            row.amount
            for row in rows
            if states[row.id] in {"released", "cleared", "recovery_pending", "recovery_pending_cleared"}
        ),
        Decimal(0),
    )
    cleared = sum((row.amount for row in rows if states[row.id] in {"cleared", "recovery_pending_cleared"}), Decimal(0))
    recovered = sum((row.amount for row in rows if states[row.id] == "reversed"), Decimal(0))
    returned = return_amounts(voucher, fund_return)
    if any(value.startswith("recovery_pending") for value in states.values()):
        state = "recovery_pending"
    elif released == due and cleared == due and due > 0:
        state = "cleared"
    elif released == due and due > 0:
        state = "released"
    elif released > 0:
        state = "partially_released"
    elif any(value == "prepared" for value in states.values()):
        state = "payment_prepared"
    elif any(value in {"authorized", "ready_for_pickup"} for value in states.values()):
        state = "authorized"
    else:
        state = "reversed" if recovered > 0 else "issued"
    if due == 0 and voucher.result.get("advance_source"):
        state = "cash_return_pending" if Decimal(returned["outstanding"]) > 0 else "settled_no_payment"
        if Decimal(returned["expected"]) > 0 and Decimal(returned["outstanding"]) == 0:
            state = "funds_returned"
    if latest and latest.state == "voided":
        state = "voided"
    return {
        "currency": voucher.result["currency"],
        "due": str(due),
        "allocated": str(reserved),
        "released": str(released),
        "cleared": str(cleared),
        "remaining": str(due - released),
        "available": str(due - reserved),
        "state": state,
        "count": len(rows),
        "recovered": str(recovered),
        "fund_return_expected": returned["expected"],
        "fund_return_verified": returned["verified"],
        "fund_return_outstanding": returned["outstanding"],
    }


def request_payment_summaries(db, request_ids):
    vouchers = list(db.scalars(select(FinanceVoucherDraft).where(FinanceVoucherDraft.request_id.in_(request_ids))))
    if not vouchers:
        return {}
    voucher_ids = [row.id for row in vouchers]
    latest = {
        row.voucher_id: row
        for row in db.scalars(
            select(FinanceVoucherEvent)
            .where(FinanceVoucherEvent.voucher_id.in_(voucher_ids))
            .distinct(FinanceVoucherEvent.voucher_id)
            .order_by(FinanceVoucherEvent.voucher_id, FinanceVoucherEvent.version.desc())
        )
    }
    instructions = list(db.scalars(select(PaymentInstruction).where(PaymentInstruction.voucher_id.in_(voucher_ids))))
    events = {
        row.instruction_id: row
        for row in db.scalars(
            select(PaymentLineEvent)
            .where(PaymentLineEvent.instruction_id.in_([row.id for row in instructions]))
            .distinct(PaymentLineEvent.instruction_id)
            .order_by(PaymentLineEvent.instruction_id, PaymentLineEvent.version.desc())
        )
    }
    grouped = {row.id: [] for row in vouchers}
    returns = {
        row.voucher_id: row
        for row in db.scalars(
            select(FundReturnEvent)
            .where(FundReturnEvent.voucher_id.in_(voucher_ids))
            .distinct(FundReturnEvent.voucher_id)
            .order_by(FundReturnEvent.voucher_id, FundReturnEvent.version.desc())
        )
    }
    states = {}
    for row in instructions:
        grouped[row.voucher_id].append(row)
        voucher_event = latest.get(row.voucher_id)
        states[row.id] = (
            "voided"
            if voucher_event and voucher_event.state == "voided"
            else balance_state(events[row.id].state, events[row.id])
            if row.id in events
            else "authorized"
            if voucher_event and voucher_event.state == "authorized"
            else "prepared"
        )
    return {
        row.request_id: balance_summary(row, grouped[row.id], states, latest[row.id], returns.get(row.id))
        if row.id in latest
        else {"state": "draft"}
        for row in vouchers
    }


def execution_view(db, voucher, actor, roles, permissions):
    summary = payment_summary(db, voucher)
    voucher_event = latest_voucher_event(db, voucher.id)
    item = db.get(PaymentRequest, voucher.request_id)
    recovery_error = recovery_blocker(db, item)
    issued = bool(
        voucher_event
        and voucher_event.state != "voided"
        and item.status == "submitted"
        and actor.id != item.requestor_id
    )
    rows = []
    for instruction in db.scalars(
        select(PaymentInstruction)
        .where(PaymentInstruction.voucher_id == voucher.id)
        .order_by(PaymentInstruction.sequence)
    ):
        state, version = line_state(db, instruction)
        method_category = instruction.result.get("method_category")
        if not method_category:
            method_category = db.get(PaymentMethod, instruction.method_id).category
        replacement = db.scalar(
            select(PaymentInstruction.id).where(PaymentInstruction.predecessor_id == instruction.id)
        )
        finance_associate = "finance_associate" in roles
        manager = "finance_manager" in roles
        rows.append(
            {
                "id": str(instruction.id),
                "sequence": instruction.sequence,
                "amount": str(instruction.amount),
                "currency": instruction.currency_code,
                "state": state,
                "version": version,
                "details": instruction.result,
                "predecessor_id": str(instruction.predecessor_id) if instruction.predecessor_id else None,
                "replacement_id": str(replacement) if replacement else None,
                "can_authorize": issued
                and state == "prepared"
                and instruction.signatory_user_id == actor.id
                and "authorized_signatory" in roles
                and "payments.authorize" in permissions,
                "can_pickup_ready": issued
                and state == "authorized"
                and method_category == "check"
                and finance_associate
                and "payments.release" in permissions,
                "can_release": issued
                and finance_associate
                and "payments.release" in permissions
                and (state == "ready_for_pickup" if method_category == "check" else state == "authorized"),
                "can_clear": issued and state == "released" and manager and "payments.clear" in permissions,
                "can_fail": issued
                and state in {"prepared", "authorized", "ready_for_pickup"}
                and manager
                and "payments.exceptions" in permissions,
                "can_replace": issued
                and state in {"failed", "voided", "reversed"}
                and not replacement
                and finance_associate
                and "payments.prepare" in permissions,
                "can_recover": issued
                and state in {"released", "cleared"}
                and finance_associate
                and not recovery_error
                and "payments.release" in permissions,
                "recovery_blocker": recovery_error if finance_associate and state in {"released", "cleared"} else None,
                "can_confirm_reversal": issued
                and state == "recovery_pending"
                and manager
                and "payments.exceptions" in permissions
                and latest_line_event(db, instruction.id).actor_user_id != actor.id,
                "history": [
                    event_view(row)
                    for row in db.scalars(
                        select(PaymentLineEvent)
                        .where(PaymentLineEvent.instruction_id == instruction.id)
                        .order_by(PaymentLineEvent.version.desc())
                    )
                ],
                "evidence": [
                    evidence_view(db, row)
                    for row in db.scalars(
                        select(PaymentEvidence)
                        .where(PaymentEvidence.instruction_id == instruction.id)
                        .order_by(PaymentEvidence.created_at.desc())
                    )
                ],
            }
        )
    fund_return = latest_return(db, voucher.id)
    return_expected = Decimal(summary["fund_return_expected"]) > 0 and bool(
        voucher_event and voucher_event.state != "voided"
    )
    return {
        "summary": summary,
        "currency_precision": db.get(Currency, voucher.result["currency"]).decimal_precision,
        "lines": rows,
        "fund_return": {
            **return_amounts(voucher, fund_return),
            "version": fund_return.version if fund_return else 0,
            "latest": return_view(fund_return) if fund_return else None,
            "evidence_available": receipt_available(db, fund_return.result) if fund_return else False,
            "can_record": issued
            and return_expected
            and (not fund_return or fund_return.state == "rejected")
            and "finance_associate" in roles
            and "payments.release" in permissions,
            "can_verify": issued
            and return_expected
            and bool(fund_return and fund_return.state == "recorded" and fund_return.actor_user_id != actor.id)
            and "finance_manager" in roles
            and "payments.clear" in permissions,
            "history": [
                return_view(row)
                for row in db.scalars(
                    select(FundReturnEvent)
                    .where(FundReturnEvent.voucher_id == voucher.id)
                    .order_by(FundReturnEvent.version.desc())
                )
            ],
        }
        if return_expected
        else None,
        "can_add": issued
        and Decimal(summary["available"]) > 0
        and "finance_associate" in roles
        and "payments.prepare" in permissions,
    }
