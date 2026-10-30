"""Add three local Department Head review samples without resetting existing requests."""
from datetime import UTC, datetime
from decimal import Decimal
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5
from sqlalchemy import select
from .audit import audit
from .config import get_settings
from .cost_center_approvals import eligible_approver
from .database import SessionLocal
from .models import (ChartAccount, CostCenter, Document, DocumentRequirementRule, DocumentType, DocumentVersion,
                     PaymentRequest, PaymentRequestLine, PaymentRequestStatusHistory, User)
from .storage import get_storage
from .workflow_service import start_workflow

SAMPLES = [
    ("920001", "Routine office supplies", "18000.00", True),
    ("920002", "Equipment purchase", "150000.00", True),
    ("920003", "Unbudgeted campus project", "1250000.00", False),
]


def seed_department_head_requests(center_code="MKTG"):
    if get_settings().app_env != "local":
        raise RuntimeError("Department Head samples are restricted to the local environment")
    content = (Path(__file__).parent / "fixtures" / "finance-validation-sample.pdf").read_bytes()
    storage = get_storage()
    created, existing = [], []
    with SessionLocal.begin() as db:
        center = db.scalar(select(CostCenter).where(CostCenter.code == center_code, CostCenter.is_active.is_(True)))
        approver = db.get(User, center.approver_user_id) if center and center.approver_user_id else None
        if not eligible_approver(db, approver):
            raise RuntimeError("Configure an active cost-center Department Head before seeding")
        owner = db.scalar(select(User).where(User.email == "requestor@payment.local", User.is_active.is_(True)))
        if not owner or owner.is_suspended or owner.id == approver.id:
            raise RuntimeError("An active distinct demo requestor is required")
        account = db.scalar(select(ChartAccount).where(ChartAccount.is_active.is_(True), ChartAccount.is_posting.is_(True)).order_by(ChartAccount.code))
        for number, purpose, amount, budgeted in SAMPLES:
            marker = f"department-head-review/{center.code}/{number}"
            request_id = uuid5(NAMESPACE_URL, marker)
            request_number = f"GEN-2026-{number}"
            if db.get(PaymentRequest, request_id):
                existing.append(request_number)
                continue
            if db.scalar(select(PaymentRequest.id).where(PaymentRequest.request_number == request_number)):
                raise RuntimeError(f"Reserved sample number already belongs to another request: {request_number}")
            now = datetime.now(UTC)
            item = PaymentRequest(id=request_id, request_number=request_number, request_type="general", status="submitted",
                requestor_id=owner.id, department_id=center.department_id, payee_name="DEMO - Sample Supplier",
                purpose=f"DEMO - Department Head review: {purpose}", currency_code="PHP", gross_amount=Decimal(amount),
                type_data={"development_seed": marker, "budgeted": budgeted, "department_cost_center_id": str(center.id),
                           "demo_current_step": 3, "demo_display_status": "For Department Approval"},
                version=2, submitted_at=now)
            db.add(item); db.flush()
            line = PaymentRequestLine(id=uuid5(NAMESPACE_URL, marker + "/line"), request_id=item.id, position=1,
                invoice_date=now.date(), invoice_number=f"DEMO-DH-{number}", vendor_name=item.payee_name,
                particulars=f"DEMO - {purpose}", chart_account_id=account.id if account else None,
                cost_center_id=center.id, amount=Decimal(amount), currency_code="PHP")
            db.add(line); db.flush()
            contexts = {(None, db.scalar(select(DocumentType.id).where(DocumentType.code == "BILLING_SOA")), 0)}
            invoice = db.scalar(select(DocumentType.id).where(DocumentType.code == "INVOICE"))
            if invoice:
                contexts.add((line.id, invoice, 0))
            for rule in db.scalars(select(DocumentRequirementRule).where(DocumentRequirementRule.request_type == "general", DocumentRequirementRule.is_active.is_(True), DocumentRequirementRule.is_required.is_(True))):
                for index in range(rule.minimum_count):
                    contexts.add((line.id if rule.scope == "line" else None, rule.document_type_id, index))
            for line_id, type_id, index in contexts:
                if not type_id:
                    raise RuntimeError("Required demo document type is unavailable")
                document_id = uuid5(NAMESPACE_URL, f"{marker}/document/{line_id}/{type_id}/{index}")
                key = f"samples/department-head/{document_id}.pdf"
                version = storage.put(key, BytesIO(content), "application/pdf", sha256(content).hexdigest())
                db.add(Document(id=document_id, request_id=item.id, line_id=line_id, document_type_id=type_id, owner_user_id=owner.id)); db.flush()
                db.add(DocumentVersion(document_id=document_id, version=1, original_filename=f"DEMO-{number}-{index}.pdf",
                    media_type="application/pdf", byte_size=len(content), sha256=sha256(content).hexdigest(), bucket=storage.bucket,
                    object_key=key, storage_version_id=version, uploaded_by_user_id=owner.id))
            db.add(PaymentRequestStatusHistory(request_id=item.id, from_status="draft", to_status="submitted", actor_user_id=owner.id,
                note="Local demonstration fixture; no Finance setup or approvals activated."))
            start_workflow(db, item, owner.id)
            audit(db, actor_id=owner.id, action="development.department_head_request_seeded", entity_type="payment_request", entity_id=item.id, request_id=None,
                after={"request_number": request_number, "cost_center": center.code, "approver_user_id": str(approver.id)})
            created.append(request_number)
        approver_name = approver.display_name
    return {"created": created, "existing_unchanged": existing, "approver": approver_name}


if __name__ == "__main__":
    print(seed_department_head_requests())
