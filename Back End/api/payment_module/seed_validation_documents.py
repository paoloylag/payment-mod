"""Idempotently attach test PDFs to local demo requests awaiting Finance validation."""

from hashlib import sha256
from io import BytesIO
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select

from .config import get_settings
from .database import SessionLocal
from .models import (
    Document,
    DocumentRequirementRule,
    DocumentType,
    DocumentVersion,
    PaymentRequest,
    PaymentRequestLine,
    WorkflowInstance,
)
from .storage import get_storage


def seed_validation_documents():
    if get_settings().app_env != "local":
        raise RuntimeError("Sample documents may only be seeded in the local environment")
    content = (Path(__file__).parent / "fixtures" / "finance-validation-sample.pdf").read_bytes()
    storage = get_storage()
    added = []
    with SessionLocal.begin() as db:
        for request in db.scalars(select(PaymentRequest).where(PaymentRequest.status == "submitted")):
            if not (request.type_data or {}).get("development_seed"):
                continue
            workflow = db.scalar(select(WorkflowInstance).where(WorkflowInstance.request_id == request.id))
            if not workflow or workflow.state != "active" or workflow.current_stage is None:
                continue
            if workflow.route_snapshot["stages"][workflow.current_stage]["role"] != "finance_associate":
                continue
            types = list(db.scalars(select(DocumentType).where(DocumentType.is_active.is_(True))))
            allowed = [kind for kind in types if request.request_type in (kind.allowed_request_types or [])]
            lines = list(db.scalars(select(PaymentRequestLine).where(PaymentRequestLine.request_id == request.id)))
            contexts = set()
            for rule in db.scalars(
                select(DocumentRequirementRule).where(
                    DocumentRequirementRule.request_type == request.request_type,
                    DocumentRequirementRule.is_active.is_(True),
                    DocumentRequirementRule.is_required.is_(True),
                )
            ):
                for line_id in [line.id for line in lines] if rule.scope == "line" else [None]:
                    for index in range(rule.minimum_count):
                        contexts.add((line_id, rule.document_type_id, index))
            preferred = next(
                (
                    kind
                    for kind in allowed
                    if kind.code == ("PROOF_PAYMENT" if request.request_type == "reimbursement" else "INVOICE")
                ),
                next(iter(allowed), None),
            )
            if preferred:
                contexts.update((line.id, preferred.id, 0) for line in lines)
            for line_id, type_id, index in contexts:
                doc_id = uuid5(NAMESPACE_URL, f"finance-validation-sample/{request.id}/{line_id}/{type_id}/{index}")
                if db.get(Document, doc_id):
                    continue
                kind = db.get(DocumentType, type_id)
                key = f"samples/finance-validation/{doc_id}.pdf"
                version_id = storage.put(key, BytesIO(content), "application/pdf", sha256(content).hexdigest())
                db.add(
                    Document(
                        id=doc_id,
                        request_id=request.id,
                        line_id=line_id,
                        document_type_id=type_id,
                        owner_user_id=request.requestor_id,
                    )
                )
                db.flush()
                db.add(
                    DocumentVersion(
                        document_id=doc_id,
                        version=1,
                        original_filename=f"TEST-{kind.code}-{str(doc_id)[:8]}.pdf",
                        media_type="application/pdf",
                        byte_size=len(content),
                        sha256=sha256(content).hexdigest(),
                        bucket=storage.bucket,
                        object_key=key,
                        storage_version_id=version_id,
                        uploaded_by_user_id=request.requestor_id,
                    )
                )
                added.append(request.request_number)
    return added


if __name__ == "__main__":
    added = seed_validation_documents()
    print(f"Added {len(added)} sample documents across {len(set(added))} requests: {', '.join(sorted(set(added)))}")
