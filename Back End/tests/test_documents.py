from uuid import uuid4

from payment_module.database import SessionLocal
from payment_module.models import Currency, Department, DocumentType, PaymentRequest, PaymentRequestLine, User
from payment_module.routers.requests import document_requirement_errors
from payment_module.seed import seed
from sqlalchemy import select

PASSWORD = "Phase01-Test-Only!"


class FakeBody:
    def __init__(self, value):
        self.value = value

    def iter_chunks(self, chunk_size=1024 * 1024):
        for start in range(0, len(self.value), chunk_size):
            yield self.value[start : start + chunk_size]

    def close(self):
        pass


class FakeStorage:
    bucket = "test-documents"

    def __init__(self):
        self.objects = {}

    def put(self, key, fileobj, media_type, checksum):
        self.objects[key] = fileobj.read()
        return "test-version"

    def open(self, key, version_id=None):
        return FakeBody(self.objects[key])

    def delete(self, key, version_id=None):
        self.objects.pop(key, None)


def login(client, email="requestor@payment.local"):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200
    return {"X-CSRF-Token": response.json()["csrf_token"]}


def create_request(status="draft", request_type="reimbursement", type_data=None):
    seed()
    with SessionLocal.begin() as db:
        user = db.scalar(select(User).where(User.email == "requestor@payment.local"))
        department = db.scalar(select(Department).where(Department.code == "MKTG"))
        assert db.get(Currency, "PHP")
        item = PaymentRequest(
            id=uuid4(),
            request_type=request_type,
            status=status,
            requestor_id=user.id,
            department_id=department.id,
            payee_name="Document Test",
            purpose="Document test",
            currency_code="PHP",
            gross_amount=0,
            type_data=type_data or {},
        )
        db.add(item)
        db.flush()
        return item.id


def test_general_payment_new_supplier_requires_bir_2303(client):
    seed(include_document_requirement_rules=True)
    existing_supplier_id = create_request(request_type="general", type_data={"new_supplier": False})
    new_supplier_id = create_request(request_type="general", type_data={"new_supplier": True})

    with SessionLocal() as db:
        existing_errors = document_requirement_errors(db, db.get(PaymentRequest, existing_supplier_id))
        new_errors = document_requirement_errors(db, db.get(PaymentRequest, new_supplier_id))

    assert [error["message"] for error in existing_errors] == ["Billing / Quotation / SOA is required"]
    assert {error["message"] for error in new_errors} == {
        "Billing / Quotation / SOA is required",
        "BIR 2303 is required",
    }

    headers = login(client)
    requirements = client.get(f"/api/v1/requests/{new_supplier_id}/document-requirements", headers=headers)
    assert requirements.status_code == 200
    by_code = {item["document_type_code"]: item for item in requirements.json()["requirements"]}
    assert by_code["BILLING_SOA"]["required"] is True
    assert by_code["BIR_2303"]["required"] is True
    assert requirements.json()["can_submit_documents"] is False


def test_reimbursement_proof_of_payment_is_required_for_every_line(client, monkeypatch):
    storage = FakeStorage()
    monkeypatch.setattr("payment_module.routers.documents.get_storage", lambda: storage)
    seed(include_document_requirement_rules=True)
    request_id = create_request(request_type="reimbursement")
    with SessionLocal.begin() as db:
        db.add_all(
            [
                PaymentRequestLine(
                    request_id=request_id,
                    position=position,
                    particulars=f"Reimbursement item {position}",
                    vendor_name="Test Merchant",
                    amount=100,
                    currency_code="PHP",
                    attachment_refs=["invoice.pdf"],
                )
                for position in (1, 2)
            ]
        )
    with SessionLocal() as db:
        lines = list(
            db.scalars(
                select(PaymentRequestLine)
                .where(PaymentRequestLine.request_id == request_id)
                .order_by(PaymentRequestLine.position)
            )
        )
        proof = db.scalar(select(DocumentType).where(DocumentType.code == "PROOF_PAYMENT"))
        errors = document_requirement_errors(db, db.get(PaymentRequest, request_id))
        assert [error["field"] for error in errors if "Proof of Payment" in error["message"]] == [
            "lines.0.documents",
            "lines.1.documents",
        ]
        line_ids = [str(line.id) for line in lines]
        proof_id = str(proof.id)

    headers = login(client)
    first = client.post(
        f"/api/v1/requests/{request_id}/documents",
        headers=headers,
        data={"document_type_id": proof_id, "line_id": line_ids[0]},
        files={"file": ("proof-1.pdf", b"%PDF-1.7 proof one", "application/pdf")},
    )
    assert first.status_code == 201, first.text
    halfway = client.get(f"/api/v1/requests/{request_id}/document-requirements", headers=headers).json()
    proof_requirement = next(item for item in halfway["requirements"] if item["document_type_code"] == "PROOF_PAYMENT")
    assert proof_requirement["scope"] == "line"
    assert proof_requirement["complete"] is False
    assert [item["complete"] for item in proof_requirement["lines"]] == [True, False]
    assert [item["position"] for item in proof_requirement["lines"]] == [1, 2]

    second = client.post(
        f"/api/v1/requests/{request_id}/documents",
        headers=headers,
        data={"document_type_id": proof_id, "line_id": line_ids[1]},
        files={"file": ("proof-2.pdf", b"%PDF-1.7 proof two", "application/pdf")},
    )
    assert second.status_code == 201, second.text
    complete = client.get(f"/api/v1/requests/{request_id}/document-requirements", headers=headers).json()
    completed_proof = next(item for item in complete["requirements"] if item["document_type_code"] == "PROOF_PAYMENT")
    assert completed_proof["complete"] is True
    assert all(item["complete"] for item in completed_proof["lines"])
    with SessionLocal() as db:
        assert not [
            error
            for error in document_requirement_errors(db, db.get(PaymentRequest, request_id))
            if "Proof of Payment" in error["message"]
        ]


def test_upload_list_preview_replace_and_duplicate_warning(client, monkeypatch):
    storage = FakeStorage()
    monkeypatch.setattr("payment_module.routers.documents.get_storage", lambda: storage)
    first_request = create_request()
    second_request = create_request()
    headers = login(client)
    pdf = b"%PDF-1.7 synthetic document"

    first = client.post(
        f"/api/v1/requests/{first_request}/documents",
        headers=headers,
        files={"file": ("invoice.pdf", pdf, "application/pdf")},
    )
    assert first.status_code == 201, first.text
    assert first.json()["previewable"] is True
    assert first.json()["duplicate_warning"] is False

    second = client.post(
        f"/api/v1/requests/{second_request}/documents",
        headers=headers,
        files={"file": ("copy.pdf", pdf, "application/pdf")},
    )
    assert second.status_code == 201, second.text
    assert second.json()["duplicate_warning"] is True
    assert second.json()["duplicate_uses"][0]["request_id"] == str(first_request)

    document_id = first.json()["id"]
    listed = client.get(f"/api/v1/requests/{first_request}/documents")
    assert listed.status_code == 200 and listed.json()[0]["id"] == document_id
    content = client.get(f"/api/v1/documents/{document_id}/content")
    assert content.status_code == 200 and content.content == pdf
    assert content.headers["content-disposition"].startswith("inline")

    replacement = client.post(
        f"/api/v1/documents/{document_id}/versions",
        headers=headers,
        files={"file": ("replacement.pdf", b"%PDF-1.7 replacement", "application/pdf")},
    )
    assert replacement.status_code == 201, replacement.text
    assert replacement.json()["current_version"] == 2
    assert [item["version"] for item in replacement.json()["versions"]] == [2, 1]


def test_document_validation_authorization_and_submitted_replacement(client, monkeypatch):
    monkeypatch.setattr("payment_module.routers.documents.get_storage", lambda: FakeStorage())
    request_id = create_request()
    headers = login(client)
    invalid = client.post(
        f"/api/v1/requests/{request_id}/documents",
        headers=headers,
        files={"file": ("script.exe", b"bad", "application/octet-stream")},
    )
    assert invalid.status_code == 422
    uploaded = client.post(
        f"/api/v1/requests/{request_id}/documents",
        headers=headers,
        files={"file": ("receipt.png", b"\x89PNG\r\n\x1a\n-data", "image/png")},
    )
    assert uploaded.status_code == 201
    document_id = uploaded.json()["id"]
    with SessionLocal.begin() as db:
        db.get(PaymentRequest, request_id).status = "submitted"
    blocked = client.post(
        f"/api/v1/documents/{document_id}/versions",
        headers=headers,
        files={"file": ("new.png", b"\x89PNG\r\n\x1a\n-new", "image/png")},
    )
    assert blocked.status_code == 409

    client.cookies.clear()
    login(client, "coo@payment.local")
    assert client.get(f"/api/v1/requests/{request_id}/documents").status_code == 404
    assert client.get(f"/api/v1/documents/{document_id}/content").status_code == 404


def test_remove_document_preserves_history_and_cleans_storage(client, monkeypatch):
    storage = FakeStorage()
    monkeypatch.setattr("payment_module.routers.documents.get_storage", lambda: storage)
    request_id = create_request()
    headers = login(client)
    uploaded = client.post(
        f"/api/v1/requests/{request_id}/documents",
        headers=headers,
        files={"file": ("receipt.pdf", b"%PDF-1.7 remove", "application/pdf")},
    )
    assert uploaded.status_code == 201
    document_id = uploaded.json()["id"]
    assert storage.objects

    removed = client.request(
        "DELETE",
        f"/api/v1/documents/{document_id}",
        headers=headers,
        json={"reason": "Incorrect attachment"},
    )
    assert removed.status_code == 204
    assert not storage.objects
    assert client.get(f"/api/v1/requests/{request_id}/documents").json() == []
    assert client.get(f"/api/v1/documents/{document_id}/content").status_code == 410


def test_required_document_rules_and_finance_histories(client, monkeypatch):
    monkeypatch.setattr("payment_module.routers.documents.get_storage", lambda: FakeStorage())
    request_id = create_request()
    with SessionLocal() as db:
        invoice = db.scalar(select(DocumentType).where(DocumentType.code == "INVOICE"))
        invoice_id = invoice.id

    admin_headers = login(client, "admin@payment.local")
    rule = client.post(
        "/api/v1/document-requirement-rules",
        headers=admin_headers,
        json={
            "request_type": "reimbursement",
            "document_type_id": str(invoice_id),
            "scope": "request",
            "minimum_count": 1,
            "is_required": True,
            "is_active": True,
        },
    )
    assert rule.status_code == 201, rule.text

    client.cookies.clear()
    requestor_headers = login(client)
    pending = client.get(f"/api/v1/requests/{request_id}/document-requirements")
    assert pending.status_code == 200
    assert pending.json()["can_submit_documents"] is False
    assert pending.json()["requirements"][0]["guidance"] is None
    with SessionLocal() as db:
        assert document_requirement_errors(db, db.get(PaymentRequest, request_id))[0]["field"] == "documents"
    uploaded = client.post(
        f"/api/v1/requests/{request_id}/documents",
        headers=requestor_headers,
        data={"document_type_id": str(invoice_id)},
        files={"file": ("invoice.pdf", b"%PDF-1.7 invoice", "application/pdf")},
    )
    assert uploaded.status_code == 201, uploaded.text
    document_id = uploaded.json()["id"]
    assert client.get(f"/api/v1/requests/{request_id}/document-requirements").json()["can_submit_documents"] is True
    with SessionLocal() as db:
        assert document_requirement_errors(db, db.get(PaymentRequest, request_id)) == []

    client.cookies.clear()
    finance_headers = login(client, "finance.associate@payment.local")
    hard_copy = client.post(
        f"/api/v1/documents/{document_id}/hard-copy",
        headers=finance_headers,
        json={"status": "received", "note": "Original received by Finance"},
    )
    assert hard_copy.status_code == 201, hard_copy.text
    assert hard_copy.json()["hard_copy_status"] == "received"
    review = client.post(
        f"/api/v1/documents/{document_id}/reviews",
        headers=finance_headers,
        json={"decision": "replacement_required", "comment": "Image is unreadable"},
    )
    assert review.status_code == 201, review.text
    assert review.json()["review_decision"] == "replacement_required"
    assert len(review.json()["review_history"]) == 1
