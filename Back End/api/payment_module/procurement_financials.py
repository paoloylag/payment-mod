"""Safe, decimal-string financial projection. No notes, bank details or files."""


def calculation_projection(snapshot, request_version):
    if snapshot is None:
        return {"status": "not_saved", "version": None, "totals": None, "lines": []}
    if snapshot.request_version != request_version:
        return {"status": "stale", "version": snapshot.version, "totals": None, "lines": []}
    result = snapshot.result
    totals = result["totals"]
    return {
        "status": "saved",
        "version": snapshot.version,
        "totals": {
            "grossAmount": totals["gross"],
            "vatAmount": totals["vat"],
            "ewtAmount": totals["ewt"],
            "netPayable": totals["amount_due"],
        },
        "lines": [
            {
                "lineId": line["line_id"],
                "position": line["position"],
                "grossAmount": line["gross"],
                "vatAmount": line["vat"],
                "ewtBase": line["ewt_base"],
                "ewtRate": line["ewt_tax"]["ewt_rate"],
                "ewtClassification": line["ewt_tax"]["ewt_classification"],
                "ewtAmount": line["ewt"],
                "netPayable": line["amount_due"],
            }
            for line in result["lines"]
        ],
    }


def financial_snapshot(db, item):
    from sqlalchemy import select

    from .finance_tax import latest_snapshot
    from .models import FinanceVoucherDraft, FinanceVoucherEvent, PaymentInstruction, PaymentMethod
    from .payment_execution import line_state, payment_summary
    from .voucher_service import latest_voucher_event

    calculation = calculation_projection(latest_snapshot(db, item.id), item.version)
    voucher = db.scalar(select(FinanceVoucherDraft).where(FinanceVoucherDraft.request_id == item.id))
    due = calculation["totals"]["netPayable"] if calculation["totals"] else None
    payment = {
        "status": "not_prepared",
        "netPayable": due,
        "released": "0",
        "cleared": "0",
        "recovered": "0",
        "remaining": due,
        "lines": [],
    }
    if voucher:
        summary = payment_summary(db, voucher)
        payment = {
            "status": summary["state"],
            "netPayable": summary["due"],
            "released": summary["released"],
            "cleared": summary["cleared"],
            "recovered": summary["recovered"],
            "remaining": summary["remaining"],
            "lines": [],
        }
        for row in db.scalars(
            select(PaymentInstruction)
            .where(PaymentInstruction.voucher_id == voucher.id)
            .order_by(PaymentInstruction.sequence)
        ):
            state, version = line_state(db, row)
            method = db.get(PaymentMethod, row.method_id)
            payment["lines"].append(
                {
                    "id": str(row.id),
                    "sequence": row.sequence,
                    "version": version,
                    "reference": row.reference,
                    "method": method.code if method else None,
                    "amount": str(row.amount),
                    "currency": row.currency_code,
                    "status": state,
                    "replacesPaymentId": str(row.predecessor_id) if row.predecessor_id else None,
                }
            )
    latest = latest_voucher_event(db, voucher.id) if voucher else None
    return {
        "currency": item.currency_code,
        "calculation": calculation,
        "payment": payment,
        "voucher": {
            "id": str(voucher.id),
            "number": next(
                (
                    row.voucher_number
                    for row in db.scalars(
                        select(FinanceVoucherEvent)
                        .where(FinanceVoucherEvent.voucher_id == voucher.id)
                        .order_by(FinanceVoucherEvent.version.desc())
                    )
                    if row.voucher_number
                ),
                None,
            ),
            "version": latest.version if latest else 0,
            "status": latest.state if latest else "draft",
        }
        if voucher
        else None,
    }
