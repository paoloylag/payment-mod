from uuid import uuid4

from payment_module.database import SessionLocal
from payment_module.models import Currency, Department, PaymentRequest, User
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


def create_request(status="draft"):
    seed()
    with SessionLocal.begin() as db:
        user = db.scalar(select(User).where(User.email == "requestor@payment.local"))
        department = db.scalar(select(Department).where(Department.code == "MKTG"))
        assert db.get(Currency, "PHP")
        item = PaymentRequest(
            id=uuid4(),
            request_type="reimbursement",
            status=status,
            requestor_id=user.id,
            department_id=department.id,
            payee_name="Document Test",
            purpose="Document test",
            currency_code="PHP",
            gross_amount=0,
        )
        db.add(item)
        db.flush()
        return item.id


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
