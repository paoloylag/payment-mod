"""Request-bound supplier onboarding; requestors never administer the shared master."""

from datetime import UTC, datetime
from uuid import NAMESPACE_URL, uuid5

from fastapi import HTTPException
from sqlalchemy import select, text

from .models import Document, DocumentReviewDecision, DocumentType, DocumentVersion, VendorRecord

SUPPLIER_DOCUMENTS = {
    "BIR_2303": "BIR 2303",
    "BUSINESS_REGISTRATION": "Business registration (SEC/DTI)",
    "BUSINESS_PERMIT": "Business permit",
}
PROFILE_FIELDS = {
    "name": 160,
    "email": 254,
    "contactPerson": 160,
    "phone": 80,
    "taxId": 80,
    "businessRegistration": 160,
    "street": 300,
    "city": 160,
}


def pending_for_request(db, item):
    record = db.get(VendorRecord, item.vendor_external_id) if item.vendor_external_id else None
    return bool(
        item.request_type == "general"
        and record
        and record.source_system == "aps"
        and record.payload.get("onboarding_request_id") == str(item.id)
        and not record.payload.get("validated_at")
        and not record.payload.get("deleted_at")
    )


def sync_supplier(db, item, actor):
    data = dict(item.type_data or {})
    if item.request_type != "general" or data.get("general_vendor_mode") != "new":
        return
    db.execute(text("SELECT pg_advisory_xact_lock(5176001)"))
    profile = {}
    for key, limit in PROFILE_FIELDS.items():
        value = data.get("general_vendor_" + key, "")
        if not isinstance(value, str) or len(value.strip()) > limit:
            raise HTTPException(422, f"Invalid supplier {key} (maximum {limit} characters)")
        profile[key] = value.strip()
    vendor_id = "VEND-" + str(uuid5(NAMESPACE_URL, "aps:request-vendor:" + str(item.id)))
    record = db.get(VendorRecord, vendor_id)
    if record and record.payload.get("validated_at"):
        if any(profile[key] != record.payload.get(key, "") for key in PROFILE_FIELDS):
            raise HTTPException(409, "This supplier is already validated; select it as an existing vendor")
        item.vendor_external_id = record.id
        item.payee_name = record.payload["name"]
        return
    if not profile["name"]:
        item.vendor_external_id = None
        return  # Partial drafts may be saved; submission will require a supplier.
    for existing in db.scalars(select(VendorRecord).where(VendorRecord.source_system == "aps")):
        if (
            existing.id != vendor_id
            and not existing.payload.get("deleted_at")
            and str(existing.payload.get("name", "")).strip().casefold() == profile["name"].casefold()
        ):
            raise HTTPException(
                409,
                "An APS supplier with this name already exists. "
                "Select it or contact Finance about its pending validation.",
            )
    previous = record.payload if record else {}
    payload = {
        **profile,
        "is_active": False,
        "informationStatus": "Information requested",
        "businessDocuments": [],
        "onboarding_request_id": str(item.id),
        "created_by_user_id": str(actor.id),
        "version": previous.get("version", 0) + 1,
    }
    if record:
        record.payload = payload
    else:
        db.add(VendorRecord(id=vendor_id, source_system="aps", payload=payload))
    item.vendor_external_id = vendor_id
    item.payee_name = profile["name"]
    item.type_data = {**data, "new_supplier": True}
    db.flush()


def supplier_document_errors(db, item, accepted=False):
    if not pending_for_request(db, item):
        return []
    found = {}
    rows = db.execute(
        select(Document, DocumentType, DocumentVersion)
        .join(DocumentType, Document.document_type_id == DocumentType.id)
        .join(
            DocumentVersion,
            (DocumentVersion.document_id == Document.id) & (DocumentVersion.version == Document.current_version),
        )
        .where(
            Document.request_id == item.id,
            Document.line_id.is_(None),
            Document.removed_at.is_(None),
            DocumentVersion.state == "available",
            DocumentType.code.in_(SUPPLIER_DOCUMENTS),
        )
    )
    for doc, kind, version in rows:
        if accepted:
            review = db.scalar(
                select(DocumentReviewDecision)
                .where(DocumentReviewDecision.document_id == doc.id)
                .order_by(DocumentReviewDecision.created_at.desc(), DocumentReviewDecision.id.desc())
            )
            if not review or review.decision != "accepted" or review.created_at < version.created_at:
                continue
        found[kind.code] = {
            "id": str(doc.id),
            "version": version.version,
            "name": version.original_filename,
            "kind": kind.name,
        }
    errors = [
        {
            "field": "documents",
            "message": label + (" must be accepted by Finance" if accepted else " is required for a new supplier"),
        }
        for code, label in SUPPLIER_DOCUMENTS.items()
        if code not in found
    ]
    return errors


def validate_supplier(db, item, actor):
    if not pending_for_request(db, item):
        return
    errors = supplier_document_errors(db, item, accepted=True)
    if errors:
        raise HTTPException(409, "; ".join(error["message"] for error in errors))
    record = db.get(VendorRecord, item.vendor_external_id)
    documents = []
    for doc, kind, version in db.execute(
        select(Document, DocumentType, DocumentVersion)
        .join(DocumentType, Document.document_type_id == DocumentType.id)
        .join(
            DocumentVersion,
            (DocumentVersion.document_id == Document.id) & (DocumentVersion.version == Document.current_version),
        )
        .where(
            Document.request_id == item.id,
            Document.line_id.is_(None),
            Document.removed_at.is_(None),
            DocumentType.code.in_(SUPPLIER_DOCUMENTS),
            DocumentVersion.state == "available",
        )
    ):
        documents.append(
            {"id": str(doc.id), "version": version.version, "name": version.original_filename, "kind": kind.name}
        )
    record.payload = {
        **record.payload,
        "is_active": True,
        "informationStatus": "Information complete",
        "validated_at": datetime.now(UTC).isoformat(),
        "validated_by_user_id": str(actor.id),
        "businessDocuments": documents,
        "version": record.payload.get("version", 1) + 1,
    }
