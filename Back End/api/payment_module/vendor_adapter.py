from copy import deepcopy

SAMPLE_VENDOR_PAYLOAD = {
    "id": "VEND-DEMO-001",
    "name": "Sample BrightTech Supply",
    "vendorType": "Company",
    "email": "brighttech@example.test",
    "contactPerson": "Alex Santos",
    "phone": "000-000-0001",
    "street": "Sample Street",
    "street2": "",
    "city": "Pasig",
    "state": "Metro Manila",
    "zip": "1600",
    "country": "Philippines",
    "taxId": "SAMPLE-TIN",
    "branchCode": "000",
    "businessRegistration": "SAMPLE-REG-001",
    "website": "https://vendor.example",
    "terms": "30 days",
    "lead": "7 days",
    "rating": "Sample",
    "tags": "Technology",
    "notes": "Fictional vendor for demonstration.",
    "informationStatus": "Information complete",
    "informationRequestedAt": "2026-09-20T01:00:00Z",
    "businessDocuments": [
        {
            "id": "DOC-001",
            "name": "registration.pdf",
            "kind": "Business registration (SEC / DTI)",
            "size": 125000,
            "uploadedAt": "2026-09-21T02:00:00Z",
        }
    ],
}
SAMPLE_VENDOR_PAYLOADS = (
    SAMPLE_VENDOR_PAYLOAD,
    {
        **SAMPLE_VENDOR_PAYLOAD,
        "id": "VEND-DEMO-002",
        "name": "Sample OfficeWorks Trading",
        "email": "officeworks@example.test",
        "contactPerson": "Jamie Reyes",
        "branchCode": "OW-MNL-01",
        "taxId": "SAMPLE-TIN-002",
        "businessRegistration": "SAMPLE-REG-002",
        "tags": "Office Supplies",
        "businessDocuments": [
            {
                "id": "DOC-002",
                "name": "bir-2303.pdf",
                "kind": "BIR 2303",
                "size": 98000,
                "uploadedAt": "2026-09-19T02:00:00Z",
            },
            {
                "id": "DOC-003",
                "name": "business-permit.pdf",
                "kind": "Business Permit",
                "size": 132000,
                "uploadedAt": "2026-09-19T02:05:00Z",
            },
        ],
    },
    {
        **SAMPLE_VENDOR_PAYLOAD,
        "id": "VEND-DEMO-003",
        "name": "Sample NewBuild Services",
        "email": "newbuild@example.test",
        "contactPerson": "Taylor Cruz",
        "branchCode": "NB-NEW-01",
        "taxId": "SAMPLE-TIN-003",
        "businessRegistration": "SAMPLE-REG-003",
        "tags": "Facilities",
        "informationStatus": "Information requested",
        "businessDocuments": [],
    },
)
SAFE_VENDOR_FIELDS = frozenset(SAMPLE_VENDOR_PAYLOAD)


def safe_vendor(payload: dict) -> dict:
    """Normalize a provider payload without exposing bank-account fields."""
    item = {key: deepcopy(value) for key, value in payload.items() if key in SAFE_VENDOR_FIELDS}
    item["id"] = str(item.get("id") or item.get("branchCode") or item.get("taxId") or item["name"])
    item["code"] = str(item.get("branchCode") or item["name"]).upper()
    item["status"] = "active" if item.get("informationStatus") == "Information complete" else "incomplete"
    return item


class MockVendorAdapter:
    def list(self, search: str = "", active_only: bool = True) -> list[dict]:
        needle = search.casefold().strip()
        items = [safe_vendor(payload) for payload in SAMPLE_VENDOR_PAYLOADS]
        return [
            item for item in items
            if (not active_only or item["status"] == "active")
            and (not needle or needle in f"{item['code']} {item['name']} {item['email']}".casefold())
        ]

    def get(self, vendor_id: str) -> dict | None:
        return next((item for item in self.list(active_only=False) if item["id"] == vendor_id), None)


def get_vendor_adapter() -> MockVendorAdapter:
    return MockVendorAdapter()
