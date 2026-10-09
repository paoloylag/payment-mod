from copy import deepcopy

SAMPLE_PURCHASE_ORDERS = (
    {
        "id": "PR-DEMO-1001",
        "poNumber": "PO-DEMO-1001",
        "sourceRequestId": "PR-DEMO-1001",
        "title": "[Sample] Staff laptop replacement",
        "status": "Approved",
        "department": "Academics / Residential Campus",
        "departmentCode": "ACAD",
        "requester": "Angela Mendoza",
        "requesterId": "USER-DEMO-ANGELA",
        "purposeType": "Activity",
        "purpose": "Replace two laptops used for lesson preparation.",
        "category": "Technology",
        "sourcingLotCategory": "Technology",
        "dueDate": "2026-10-09",
        "amount": 89000,
        "currency": "PHP",
        "vendorId": "VEND-DEMO-001",
        "vendorName": "Sample BrightTech Supply",
        "vendorEmail": "brighttech@example.test",
        "newSupplier": False,
        "items": [
            {
                "name": "Sample Staff Laptop",
                "description": "14-inch laptop, 16 GB RAM, 512 GB SSD",
                "category": "Technology",
                "uom": "UNIT",
                "quantity": 2,
                "unitPrice": 44500,
            }
        ],
        "rfqQuotes": [],
        "invoices": [
            {
                "id": "INV-DEMO-001",
                "name": "invoice.pdf",
                "kind": "Vendor invoice",
                "size": 95000,
                "uploadedAt": "2026-09-24T02:00:00Z",
            }
        ],
        "apsPayment": None,
    },
    {
        "id": "PR-DEMO-1002",
        "poNumber": "PO-DEMO-1002",
        "sourceRequestId": "PR-DEMO-1002",
        "title": "[Sample] Campus repair materials",
        "status": "Approved",
        "department": "Operations",
        "departmentCode": "OPS",
        "requester": "Mara Reyes",
        "requesterId": "USER-DEMO-REQUESTOR",
        "purposeType": "Project",
        "purpose": "Purchase materials for scheduled campus repairs.",
        "category": "Facilities",
        "sourcingLotCategory": "Facilities",
        "dueDate": "2026-10-16",
        "amount": 125000,
        "currency": "PHP",
        "vendorId": "VEND-DEMO-003",
        "vendorName": "Sample NewBuild Services",
        "vendorEmail": "newbuild@example.test",
        "newSupplier": True,
        "items": [
            {
                "name": "Repair materials lot",
                "description": "Sample construction and repair materials",
                "category": "Facilities",
                "uom": "LOT",
                "quantity": 1,
                "unitPrice": 125000,
            }
        ],
        "rfqQuotes": [],
        "invoices": [],
        "apsPayment": None,
    },
    {
        "id": "PR-DEMO-1003",
        "poNumber": "PO-DEMO-1003",
        "sourceRequestId": "PR-DEMO-1003",
        "title": "[Sample] Completed laptop replacement",
        "status": "Filed",
        "department": "Academics / Residential Campus",
        "departmentCode": "ACAD",
        "requester": "Angela Mendoza",
        "requesterId": "USER-DEMO-ANGELA",
        "purposeType": "Activity",
        "purpose": "Demonstrate an already-paid Procurement record.",
        "category": "Technology",
        "sourcingLotCategory": "Technology",
        "dueDate": "2026-09-25",
        "amount": 89000,
        "currency": "PHP",
        "vendorId": "VEND-DEMO-001",
        "vendorName": "Sample BrightTech Supply",
        "vendorEmail": "brighttech@example.test",
        "newSupplier": False,
        "items": [
            {
                "name": "Sample Staff Laptop",
                "description": "14-inch laptop, 16 GB RAM, 512 GB SSD",
                "category": "Technology",
                "uom": "UNIT",
                "quantity": 2,
                "unitPrice": 44500,
            }
        ],
        "rfqQuotes": [],
        "invoices": [
            {
                "id": "INV-001",
                "name": "invoice.pdf",
                "kind": "Vendor invoice",
                "size": 95000,
                "uploadedAt": "2026-09-24T02:00:00Z",
            }
        ],
        "apsPayment": {
            "eventId": "APS-EVENT-001",
            "paymentReference": "APS-PAY-001",
            "poNumber": "PO-DEMO-1003",
            "amount": 89000,
            "currency": "PHP",
            "status": "paid",
            "paidAt": "2026-09-25T02:00:00Z",
            "closedBy": "Sample APS Admin",
            "closedAt": "2026-09-25T03:00:00Z",
        },
    },
)


def normalize_purchase_order(payload: dict) -> dict:
    item = deepcopy(payload)
    item["paymentEligible"] = item.get("status") == "Approved" and not item.get("apsPayment")
    return item


class MockProcurementAdapter:
    def list(self, search: str = "", eligible_only: bool = True) -> list[dict]:
        needle = search.casefold().strip()
        items = [normalize_purchase_order(payload) for payload in SAMPLE_PURCHASE_ORDERS]
        return [
            item for item in items
            if (not eligible_only or item["paymentEligible"])
            and (not needle or needle in f"{item['poNumber']} {item['title']} {item['vendorName']}".casefold())
        ]

    def get(self, po_number: str) -> dict | None:
        return next((item for item in self.list(eligible_only=False) if item["poNumber"] == po_number), None)


def get_procurement_adapter() -> MockProcurementAdapter:
    return MockProcurementAdapter()
