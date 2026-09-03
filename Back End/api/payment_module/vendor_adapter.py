from copy import deepcopy

SAMPLE_VENDOR_PAYLOAD = {
    "name": "Power Mac Center, Inc.",
    "email": "education@powermaccenter.com",
    "terms": "30 days",
    "lead": "7 days",
    "rating": "4.8",
    "vendorType": "Company",
    "contactPerson": "Juan Dela Cruz",
    "phone": "+63 917 123 4567",
    "street": "123 Business Avenue",
    "street2": "Second Floor",
    "city": "Makati City",
    "state": "Metro Manila",
    "zip": "1200",
    "country": "Philippines",
    "taxId": "123-456-789-000",
    "branchCode": "PMC-MNL-01",
    "website": "https://www.example.com",
    "tags": "Technology, Computers, Education",
    "notes": "Authorized technology equipment supplier.",
    "bankName": "Sample Bank",
    "bankAccountName": "Power Mac Center, Inc.",
    # Clear bank details are intentionally excluded from committed fixtures.
    "businessRegistration": "SEC-2026-001234",
    "complianceDocuments": ["SEC Registration.pdf", "BIR Certificate.pdf", "Mayor's Permit.pdf"],
    "informationStatus": "Information complete",
    "informationRequestedAt": "2026-09-03T09:00:00.000Z",
}


def safe_vendor(payload: dict) -> dict:
    """Normalize a provider payload without exposing its full bank-account number."""
    item = deepcopy(payload)
    number = str(item.pop("bankAccountNumber", ""))
    item["id"] = str(item.get("branchCode") or item.get("taxId") or item["name"])
    item["code"] = str(item.get("branchCode") or item["name"]).upper()
    item["status"] = "active" if item.get("informationStatus") == "Information complete" else "incomplete"
    item["maskedBankAccountNumber"] = f"•••• {number[-4:]}" if number else None
    return item


class MockVendorAdapter:
    def list(self, search: str = "", active_only: bool = True) -> list[dict]:
        item = safe_vendor(SAMPLE_VENDOR_PAYLOAD)
        needle = search.casefold().strip()
        if active_only and item["status"] != "active":
            return []
        if needle and needle not in f"{item['code']} {item['name']} {item['email']}".casefold():
            return []
        return [item]

    def get(self, vendor_id: str) -> dict | None:
        item = safe_vendor(SAMPLE_VENDOR_PAYLOAD)
        return item if item["id"] == vendor_id else None


def get_vendor_adapter() -> MockVendorAdapter:
    return MockVendorAdapter()
