"""Fictional local showcase, never a live Procurement feed."""

CATALOG = "workflow-showcase-20261117"
VENDOR_ID = "SHOWCASE-PROCUREMENT-20261117"


def purchase_orders():
    return [
        {
            "id": f"SHOWCASE-PO-{index}",
            "poNumber": f"PO-SHOWCASE-{index:03d}",
            "sourceRequestId": f"SHOWCASE-PR-{index}",
            "title": "[DEMO] " + title,
            "status": "Approved",
            "department": "Marketing",
            "departmentCode": "MKTG",
            "requester": "Demo requestor",
            "vendorId": VENDOR_ID,
            "vendorName": "[Demo] Campus Technology Supplies",
            "vendorEmail": "demo@example.test",
            "purpose": title,
            "amount": amount,
            "currency": "PHP",
            "dueDate": "2026-12-15",
            "items": [
                {
                    "id": f"SHOWCASE-LINE-{index}",
                    "name": title,
                    "description": title,
                    "quantity": 1,
                    "uom": "LOT",
                    "unitPrice": amount,
                }
            ],
            "rfqQuotes": [],
            "invoices": [],
            "apsPayment": None,
            "is_sample": True,
            "integration_demo_only": True,
        }
        for index, (title, amount) in enumerate(
            [
                ("Computer laboratory peripherals", 44800),
                ("Approved network maintenance", 56000),
                ("Partial library equipment payment", 112000),
                ("Recovered equipment payment", 33600),
            ],
            1,
        )
    ]


def scenarios():
    result = [
        ("general", "draft", "Draft - supplier and account selection", 5600, True),
        ("reimbursement", "documents", "Document preparation - travel reimbursement", 3360, True),
    ]
    for role, amount in [
        ("department_head", 8400),
        ("finance_associate", 16800),
        ("finance_manager", 44800),
        ("coo", 224000),
        ("president", 448000),
        ("board_member", 1568000),
    ]:
        for index in range(3):
            kind = "general"
            if role == "department_head" and index == 1:
                kind = "reimbursement"
            if role == "department_head" and index == 2:
                kind = "pettyCash"
            if role == "finance_associate" and index == 1:
                kind = "reimbursement"
            if role == "finance_associate" and index == 2:
                kind = "cashAdvance"
            if role == "finance_manager" and index == 1:
                kind = "poPayment"
            if role == "finance_manager" and index == 2:
                kind = "cashAdvance"
            value = 1200 if kind == "pettyCash" else 20000 if kind == "cashAdvance" else amount + index * 1120
            if kind == "poPayment":
                value = 44800
            result.append(
                (
                    kind,
                    role,
                    f"{role.replace('_', ' ').title()} review - scenario {index + 1}",
                    value,
                    role != "board_member",
                )
            )
    result += [
        ("reimbursement", "returned", "Return to requestor - replace receipt", 5600, True),
        ("general", "finance_response", "Return to Finance Associate - clarify EWT", 56000, True),
        ("general", "declined", "Fully declined - duplicate purchase", 11200, True),
        ("general", "approved", "Approved - mixed 1% and 2% EWT, accounting next", 67200, True),
        ("poPayment", "voucher_draft", "PO approved - net payable and voucher certification", 56000, True),
        ("general", "issued", "Voucher issued - prepare payment lines", 22400, True),
        ("general", "prepared", "Payment prepared - release with evidence", 33600, True),
        ("poPayment", "partial", "PO partial release - balance outstanding", 112000, True),
        ("reimbursement", "released", "Released reimbursement - clearing next", 11200, True),
        ("general", "cleared", "Cleared payment - reconciliation", 33600, True),
        ("general", "complete", "Completed request - archived audit trail", 5600, True),
        ("poPayment", "reversed", "Recovered PO payment - prepare replacement", 33600, True),
        ("cashAdvance", "advance_source", "Released advance - ready for liquidation", 20000, True),
        ("liquidation", "approved", "Liquidation - excess over original advance", 22400, True),
        ("cashAdvance", "return_pending", "Unused advance - Manager verifies full return", 15000, True),
        ("cashAdvance", "return_verified", "Verified full fund return - settled advance", 10000, True),
        ("pettyCash", "petty_approved", "Petty Cash approved - Associate creates voucher", 1850, True),
        ("pettyCash", "petty_voucher", "Petty Cash voucher - tax free and complete", 2500, True),
    ]
    return result
