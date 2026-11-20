from payment_module.database import SessionLocal
from payment_module.models import DocumentType
from payment_module.seed import seed
from sqlalchemy import select
from test_documents import FakeStorage
from test_finance_validation import advance_to_finance, login, submitted_request


def test_finance_line_upload_is_scoped_and_pending(client, monkeypatch):
    seed()
    storage = FakeStorage()
    monkeypatch.setattr("payment_module.routers.documents.get_storage", lambda: storage)
    request_id, line_id = submitted_request()
    other_request, other_line = submitted_request()
    with SessionLocal() as db:
        kind = db.scalar(select(DocumentType).where(DocumentType.code == "INVOICE"))
        kind_id = str(kind.id)
    url = f"/api/v1/requests/{request_id}/documents"

    def upload(headers, line=str(line_id)):
        return client.post(
            url,
            headers=headers,
            data={"document_type_id": kind_id, **({"line_id": line} if line else {})},
            files={"file": ("test.pdf", b"%PDF-1.4\nTest document", "application/pdf")},
        )

    associate = login(client, "finance.associate@payment.local")
    assert upload(associate).status_code == 403
    advance_to_finance(client, request_id)
    manager = login(client, "finance.manager@payment.local")
    assert upload(manager).status_code == 403
    associate = login(client, "finance.associate@payment.local")
    assert upload(associate, None).status_code == 403
    assert upload(associate, str(other_line)).status_code in {404, 422}
    result = upload(associate)
    assert result.status_code == 201, result.text
    summary = client.get(f"/api/v1/finance-validation/{request_id}").json()
    document = next(item for item in summary["documents"] if item["filename"] == "test.pdf")
    assert document["line_id"] == str(line_id)
    assert document["decision"] == "pending"
    content = client.get(f"/api/v1/documents/{document['document_id']}/content")
    assert content.status_code == 200
    assert content.content == b"%PDF-1.4\nTest document"


def test_sample_seed_only_targets_demo_finance_requests_and_is_idempotent(client, monkeypatch):
    from types import SimpleNamespace

    from payment_module import seed_validation_documents as module
    from payment_module.models import Document, PaymentRequest

    seed()
    sample_request, _ = submitted_request()
    ordinary_request, _ = submitted_request()
    with SessionLocal.begin() as db:
        item = db.get(PaymentRequest, sample_request)
        item.type_data = {**item.type_data, "development_seed": "finance-upload-test"}
        item.request_number = "TEST-FINANCE-UPLOAD"
    storage = FakeStorage()
    monkeypatch.setattr(module, "get_settings", lambda: SimpleNamespace(app_env="local"))
    monkeypatch.setattr(module, "get_storage", lambda: storage)
    assert module.seed_validation_documents() == []
    advance_to_finance(client, sample_request)
    advance_to_finance(client, ordinary_request)
    assert module.seed_validation_documents() == ["TEST-FINANCE-UPLOAD"]
    assert module.seed_validation_documents() == []
    assert all(content.startswith(b"%PDF-") for content in storage.objects.values())
    with SessionLocal() as db:
        assert len(list(db.scalars(select(Document).where(Document.request_id == ordinary_request)))) == 1
