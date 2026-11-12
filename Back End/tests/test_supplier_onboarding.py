from copy import deepcopy
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from payment_module.database import SessionLocal
from payment_module.models import (
    Document,
    DocumentRequirementRule,
    DocumentReviewDecision,
    DocumentType,
    DocumentVersion,
    PaymentRequest,
    User,
    VendorRecord,
)
from payment_module.routers.requests import document_requirement_errors
from payment_module.seed import seed
from payment_module.vendor_onboarding import SUPPLIER_DOCUMENTS
from payment_module.workflow_service import start_workflow
from sqlalchemy import delete, select
from test_finance_validation import advance_to_finance, login


@pytest.fixture(autouse=True)
def vendors():
    seed()
    with SessionLocal() as db:
        before = {v.id: deepcopy(v.payload) for v in db.scalars(select(VendorRecord))}
    yield
    with SessionLocal.begin() as db:
        db.execute(delete(VendorRecord).where(VendorRecord.id.not_in(list(before))))
        for key, value in before.items():
            db.get(VendorRecord, key).payload = value


def create(client, name=None):
    auth = login(client, "requestor@payment.local")
    departments = client.get("/api/v1/departments").json()
    payload = {
        "request_type": "general",
        "department_id": next(d["id"] for d in departments if d["code"] == "MKTG"),
        "currency_code": "PHP",
        "payee_name": "Forged",
        "type_data": {
            "general_vendor_mode": "new",
            "general_vendor_name": name or "Supplier " + str(uuid4()),
            "general_vendor_email": "supplier@example.test",
            "budgeted": True,
        },
        "lines": [{"particulars": "Supplier test", "amount": 1000, "currency_code": "PHP"}],
    }
    response = client.post("/api/v1/requests", headers=auth, json=payload)
    assert response.status_code == 201, response.text
    return response.json(), payload, auth


def add_documents(request_id, codes, accepted=False):
    with SessionLocal.begin() as db:
        item = db.get(PaymentRequest, request_id)
        for code in codes:
            kind = db.scalar(select(DocumentType).where(DocumentType.code == code))
            doc = Document(request_id=item.id, owner_user_id=item.requestor_id, document_type_id=kind.id)
            db.add(doc)
            db.flush()
            db.add(
                DocumentVersion(
                    document_id=doc.id,
                    version=1,
                    original_filename=code + ".pdf",
                    media_type="application/pdf",
                    byte_size=100,
                    sha256="a" * 64,
                    bucket="test",
                    object_key="supplier/" + str(uuid4()),
                    uploaded_by_user_id=item.requestor_id,
                    created_at=datetime.now(UTC) - timedelta(seconds=1),
                )
            )
            if accepted:
                db.add(DocumentReviewDecision(document_id=doc.id, decision="accepted", actor_user_id=item.requestor_id))


def test_requestor_creates_one_pending_supplier_and_cannot_select_it_elsewhere(client):
    item, payload, auth = create(client)
    vendor_id = item["vendor_external_id"]
    assert item["payee_name"] == payload["type_data"]["general_vendor_name"]
    assert vendor_id not in {v["id"] for v in client.get("/api/v1/vendors").json()}
    updated = client.patch(
        "/api/v1/requests/" + item["id"],
        headers=auth,
        json={**payload, "version": item["version"], "vendor_external_id": vendor_id},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["vendor_external_id"] == vendor_id
    forged = client.post(
        "/api/v1/requests",
        headers=auth,
        json={**payload, "vendor_external_id": vendor_id, "type_data": {"general_vendor_mode": "existing"}},
    )
    assert forged.status_code == 422
    assert client.post("/api/v1/vendors", headers=auth, json={"name": "Bypass"}).status_code == 403
    fm = login(client, "finance.manager@payment.local")
    assert (
        client.patch(
            "/api/v1/vendors/" + vendor_id,
            headers=fm,
            json={"informationStatus": "Information complete", "is_active": True},
        ).status_code
        == 409
    )


def test_supplier_documents_are_required_even_without_configured_rules(client):
    item, _, _ = create(client)
    with SessionLocal() as db:
        for rule in db.scalars(
            select(DocumentRequirementRule).where(DocumentRequirementRule.request_type == "general")
        ):
            rule.is_active = False
        db.flush()
        errors = document_requirement_errors(db, db.get(PaymentRequest, item["id"]))
        assert all(any(label in e["message"] for e in errors) for label in SUPPLIER_DOCUMENTS.values())
    add_documents(item["id"], SUPPLIER_DOCUMENTS)
    with SessionLocal() as db:
        errors = document_requirement_errors(db, db.get(PaymentRequest, item["id"]))
        assert not any("new supplier" in e["message"] for e in errors)
        doc = db.scalar(
            select(Document)
            .join(DocumentType)
            .where(Document.request_id == item["id"], DocumentType.code == "BUSINESS_PERMIT")
        )
        doc.removed_at = datetime.now(UTC)
        db.flush()
        assert any(
            "Business permit" in e["message"]
            for e in document_requirement_errors(db, db.get(PaymentRequest, item["id"]))
        )


def test_finance_approval_activates_only_after_current_documents_are_accepted(client):
    item, _, _ = create(client)
    add_documents(item["id"], [*SUPPLIER_DOCUMENTS, "BILLING_SOA"])
    with SessionLocal.begin() as db:
        request = db.get(PaymentRequest, item["id"])
        request.status = "submitted"
        request.version = 2
        start_workflow(db, request, request.requestor_id)
    advance_to_finance(client, item["id"])
    auth = login(client, "finance.associate@payment.local")
    root = "/api/v1/finance-validation/" + item["id"]
    line = item["lines"][0]["id"]
    accepted = client.post(
        root + "/lines/" + line + "/reviews", headers=auth, json={"request_version": 2, "decision": "accepted"}
    )
    assert accepted.status_code == 201, accepted.text
    approve = "/api/v1/workflow/" + item["id"] + "/approve"
    assert (
        client.post(approve, headers={**auth, "Idempotency-Key": str(uuid4())}, json={"version": 2}).status_code == 409
    )
    with SessionLocal.begin() as db:
        docs = list(db.scalars(select(Document).where(Document.request_id == item["id"])))
        actor = db.scalar(select(User).where(User.email == "finance.associate@payment.local"))
        for doc in docs:
            db.add(DocumentReviewDecision(document_id=doc.id, decision="accepted", actor_user_id=actor.id))
    key = str(uuid4())
    for _ in range(2):
        result = client.post(approve, headers={**auth, "Idempotency-Key": key}, json={"version": 2})
        assert result.status_code == 200, result.text
    assert item["vendor_external_id"] in {v["id"] for v in client.get("/api/v1/vendors").json()}
    with SessionLocal() as db:
        vendor = db.get(VendorRecord, item["vendor_external_id"])
        assert vendor.payload["validated_by_user_id"] == str(actor.id)
        assert len(vendor.payload["businessDocuments"]) == 3


def test_duplicate_supplier_names_are_blocked_and_procurement_stays_separate(client):
    item, payload, auth = create(client)
    response = client.post("/api/v1/requests", headers=auth, json=payload)
    assert response.status_code == 409
    response = client.post(
        "/api/v1/requests",
        headers=auth,
        json={**payload, "vendor_external_id": "VEND-DEMO-001", "type_data": {"general_vendor_mode": "existing"}},
    )
    assert response.status_code == 422
