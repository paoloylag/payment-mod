"""Readiness checks for the Finance Associate approval stage."""

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from .finance_configuration import active_configuration, request_coding
from .finance_tax import latest_snapshot
from .models import (
    Document,
    DocumentReviewDecision,
    DocumentType,
    DocumentVersion,
    FinanceLineReview,
    PaymentRequest,
    PaymentRequestLine,
    SystemSetting,
)
from .routers.requests import document_requirement_errors


def validation_summary(db: Session, item: PaymentRequest) -> dict:
    lines = list(
        db.scalars(
            select(PaymentRequestLine)
            .where(PaymentRequestLine.request_id == item.id)
            .order_by(PaymentRequestLine.position)
        )
    )
    documents = list(db.scalars(select(Document).where(Document.request_id == item.id, Document.removed_at.is_(None))))
    requirement_errors = document_requirement_errors(db, item)
    blockers = [error["message"] for error in requirement_errors]
    checks = [
        {
            "label": "Required documents uploaded",
            "complete": not requirement_errors,
            "details": list(dict.fromkeys(blockers)),
        }
    ]
    proof_type_ids = set(db.scalars(select(DocumentType.id).where(DocumentType.code == "PROOF_PAYMENT")))
    line_results = []
    for line in lines:
        review = db.scalar(
            select(FinanceLineReview)
            .where(FinanceLineReview.line_id == line.id, FinanceLineReview.request_version == item.version)
            .order_by(FinanceLineReview.created_at.desc(), FinanceLineReview.id.desc())
        )
        decision = review.decision if review else "pending"
        physical_received = bool(review and review.physical_original_received)
        if decision != "accepted":
            blockers.append(f"Line {line.position} must be accepted by Finance")
        if item.request_type == "reimbursement" and not physical_received:
            blockers.append(f"Line {line.position} physical original has not been received")
        line_documents = [document for document in documents if document.line_id == line.id]
        if line.attachment_refs and not line_documents:
            blockers.append(f"Line {line.position} attachments are not available for Finance review")
        if item.request_type == "reimbursement" and not any(
            document.document_type_id in proof_type_ids for document in line_documents
        ):
            blockers.append(f"Line {line.position} proof of payment is required")
        checks.append(
            {"label": f"Line {line.position} accepted by Finance", "complete": decision == "accepted", "details": []}
        )
        if item.request_type == "reimbursement":
            checks.append(
                {
                    "label": f"Line {line.position} physical original received",
                    "complete": physical_received,
                    "details": [],
                }
            )
        if item.request_type == "reimbursement":
            checks.append(
                {
                    "label": f"Line {line.position} proof of payment uploaded",
                    "complete": any(document.document_type_id in proof_type_ids for document in line_documents),
                    "details": [],
                }
            )
        if line.attachment_refs:
            checks.append(
                {
                    "label": f"Line {line.position} attachments available",
                    "complete": bool(line_documents),
                    "details": [],
                }
            )
        line_results.append(
            {
                "line_id": str(line.id),
                "position": line.position,
                "particulars": line.particulars,
                "decision": decision,
                "reason": review.reason if review else "",
                "physical_original_received": physical_received,
                "reviewed_by": str(review.actor_user_id) if review else None,
                "reviewed_at": review.created_at.isoformat() if review else None,
            }
        )
    if not lines:
        checks.append({"label": "Request has lines to validate", "complete": False, "details": []})
        blockers.append("The request has no lines to validate")
    document_results = []
    for document in documents:
        version = db.scalar(
            select(DocumentVersion).where(
                DocumentVersion.document_id == document.id, DocumentVersion.version == document.current_version
            )
        )
        review = db.scalar(
            select(DocumentReviewDecision)
            .where(DocumentReviewDecision.document_id == document.id)
            .order_by(DocumentReviewDecision.created_at.desc(), DocumentReviewDecision.id.desc())
        )
        current_decision = (
            review.decision if review and version and review.created_at >= version.created_at else "pending"
        )
        if not version or version.state != "available" or current_decision != "accepted":
            blockers.append(
                f"Document {version.original_filename if version else document.id} must be accepted by Finance"
            )
        checks.append(
            {
                "label": f"Document {version.original_filename if version else document.id} accepted by Finance",
                "complete": bool(version and version.state == "available" and current_decision == "accepted"),
                "details": [],
            }
        )
        document_results.append(
            {
                "document_id": str(document.id),
                "line_id": str(document.line_id) if document.line_id else None,
                "filename": version.original_filename if version else "Unavailable document",
                "decision": current_decision,
            }
        )
    active = active_configuration(db)
    if item.request_type != "pettyCash" and (item.request_type == "general" or active and active.configuration.get("scope") == "all"):
        setting = db.scalar(select(SystemSetting).where(SystemSetting.key == "finance.setup.draft"))
        configured = bool(
            active_configuration(db)
            or request_coding(db, item)
            or setting
            and json.loads(setting.value).get("tax_by_request_type", {}).get("general")
        )
        snapshot = latest_snapshot(db, item.id)
        if configured or snapshot:
            current = bool(snapshot and snapshot.request_version == item.version)
            checks.append({"label": "Finance calculation saved", "complete": current, "details": []})
            if not current:
                blockers.append("Save the EWT calculation for the current request before approval")
    return {
        "request_id": str(item.id),
        "request_version": item.version,
        "ready_to_approve": not blockers,
        "blockers": list(dict.fromkeys(blockers)),
        "checks": checks,
        "lines": line_results,
        "documents": document_results,
    }
