"""Shared display labels for persisted request/approval/payment states."""

ROLE_LABELS = {
    "department_head": "Department Head",
    "finance_associate": "Finance Associate",
    "finance_manager": "Finance Manager",
    "coo": "COO",
    "president": "President",
    "board_member": "Board",
}
STAGE_LABELS = {
    "department_head": "Department Approval",
    "finance_associate": "Document Validation",
    "finance_manager": "Finance Budget Review",
    "coo": "COO Approval",
    "president": "President Approval",
    "board_member": "Board Approval",
}
PAYMENT_LABELS = {
    "draft": "Voucher Draft",
    "issued": "Voucher Issued",
    "payment_prepared": "Signatory Approval",
    "authorized": "Payment Authorized — Release Pending",
    "partially_released": "Partially Released",
    "released": "Payment Released",
    "cleared": "Payment Cleared",
    "voided": "Voucher Voided",
    "recovery_pending": "Payment Recovery Review",
    "reversed": "Payment Reversed — Replacement Preparation",
    "fund_return_pending": "Full Advance Return Review",
    "funds_returned": "Fund Return Verified",
    "settled_no_payment": "Liquidation Settled — No Additional Payment",
    "cash_return_pending": "Cash Return Pending",
}
TYPE_LABELS = {
    "general": "General Payment",
    "reimbursement": "Reimbursement",
    "cashAdvance": "Cash Advance",
    "liquidation": "Liquidation",
    "poPayment": "Purchase Order Payment",
}


def request_display(item, workflow, payment):
    label = {"returned": "Returned for Information", "draft": "Draft Request"}.get(item.status, item.status.title())
    role, purpose = None, ""
    if item.status == "submitted":
        if workflow and workflow.state in {"active", "information_requested"} and workflow.current_stage is not None:
            stage = workflow.route_snapshot["stages"][workflow.current_stage]
            role = "finance_associate" if workflow.state == "information_requested" else stage["role"]
            purpose = stage["purpose"]
            label = (
                ("Information Requested by " + ROLE_LABELS.get(stage["role"], stage["role"]))
                if workflow.state == "information_requested"
                else STAGE_LABELS.get(role, purpose)
            )
        elif workflow and workflow.state == "approved":
            label = "Approved — Finance Processing"
        if payment.get("state") in PAYMENT_LABELS:
            label = PAYMENT_LABELS[payment["state"]]
    return {"display_status": label, "workflow_stage_role": role, "workflow_stage_purpose": purpose}
