from copy import deepcopy

SAMPLE_VENDOR_PAYLOAD = {
    "id": "VEND-DEMO-001",
    "source": "procurement",
    "is_sample": True,
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
        "source": "aps",
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
SAFE_VENDOR_FIELDS = frozenset(SAMPLE_VENDOR_PAYLOAD) | {
    "provider_id",
    "qualificationStatus",
    "address",
    "is_active",
    "version",
    "onboarding_request_id",
    "validated_at",
    "validated_by_user_id",
}


def safe_vendor(payload: dict) -> dict:
    """Project a vendor profile without exposing bank-account fields."""
    item = {key: deepcopy(value) for key, value in payload.items() if key in SAFE_VENDOR_FIELDS}
    item["id"] = str(item.get("id") or item.get("branchCode") or item.get("taxId") or item["name"])
    item["code"] = str(item.get("branchCode") or item["name"]).upper()
    item["is_active"] = item.get("is_active", True)
    item["version"] = item.get("version", 1)
    item["source"] = item.get("source", "aps")
    item["is_sample"] = item.get("is_sample", False)
    item["status"] = (
        "pending_validation"
        if item.get("onboarding_request_id") and not item.get("validated_at")
        else "inactive"
        if not item["is_active"]
        else "active"
        if item.get("informationStatus") == "Information complete"
        else "incomplete"
    )
    return item


class SharedVendorAdapter:
    """Read canonical shared rows; ownership is a database column, not client JSON."""

    def __init__(self, db=None):
        self.db = db

    def list(self, search: str = "", active_only: bool = True) -> list[dict]:
        if self.db is None:
            return []
        from sqlalchemy import select

        from .config import get_settings
        from .models import VendorRecord

        needle = search.casefold().strip()
        include_samples = get_settings().app_env in {"local", "test"}
        records = self.db.scalars(select(VendorRecord).order_by(VendorRecord.id))
        from .procurement_vendors import configuration, vendors

        remote = configuration() is not None
        items = [
            safe_vendor({**record.payload, "id": record.id, "source": record.source_system})
            for record in records
            if not record.payload.get("deleted_at")
            and (include_samples or not record.payload.get("is_sample"))
            and not (remote and record.source_system == "procurement")
        ]
        if remote:
            items.extend(safe_vendor(item) for item in vendors(search, active_only))
        return [
            item
            for item in items
            if (not active_only or item["status"] == "active")
            and (not needle or needle in f"{item['code']} {item['name']} {item['email']}".casefold())
        ]

    def get(self, vendor_id: str) -> dict | None:
        from .procurement_vendors import configuration, vendor

        if vendor_id.startswith("procurement:") and configuration():
            item = vendor(vendor_id)
            return safe_vendor(item) if item else None
        if self.db is None:
            return None
        from .config import get_settings
        from .models import VendorRecord

        record = self.db.get(VendorRecord, vendor_id)
        if (
            record is None
            or record.payload.get("deleted_at")
            or record.source_system == "procurement"
            and configuration()
            or record.payload.get("is_sample")
            and get_settings().app_env not in {"local", "test"}
        ):
            return None
        return safe_vendor({**record.payload, "id": record.id, "source": record.source_system})


def get_vendor_adapter(db=None) -> SharedVendorAdapter:
    return SharedVendorAdapter(db)
