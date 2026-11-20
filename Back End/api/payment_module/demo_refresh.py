"""Explicit local-only replacement of disposable requests; never runs at API startup."""

import argparse
import hashlib
import io
import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import select

from .config import get_settings
from .database import SessionLocal
from .demo_scenarios import CATALOG, VENDOR_ID, purchase_orders, scenarios
from .finance_accounting import build_entries
from .finance_configuration import active_configuration, mapping_for_department, save_coding
from .finance_tax import build_calculation
from .models import (
    CostCenter,
    Document,
    DocumentHardCopyEvent,
    DocumentRequirementRule,
    DocumentReviewDecision,
    DocumentType,
    DocumentVersion,
    FinanceJournalSnapshot,
    FinanceLineReview,
    FinanceTaxSnapshot,
    FinanceVoucherDraft,
    FinanceVoucherEvent,
    FundReturnEvent,
    PaymentEvidence,
    PaymentInstruction,
    PaymentLineEvent,
    PaymentMethod,
    PaymentRequest,
    PaymentRequestLine,
    PettyCashVoucher,
    RequestConversationMessage,
    RequestMentionNotification,
    Role,
    SystemSetting,
    TaxCode,
    User,
    UserRole,
    VendorRecord,
    WorkflowAssignment,
    WorkflowEvent,
    WorkflowInstance,
)
from .procurement_events import queue_approval, queue_financial_update
from .storage import get_storage
from .workflow_policy import route_for


def sample_pdf(title):
    text = ("FICTIONAL DEMO - NOT A VALID INVOICE: " + title).encode("ascii", "replace").decode()
    text = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT /F1 11 Tf 36 740 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    data = b"%PDF-1.4\n"
    offsets = [0]
    for index, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data += f"{index} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(data)
    data += b"xref\n0 6\n0000000000 65535 f \n" + b"".join(
        f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:]
    )
    return data + f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()


def populate(db, *, replace_all, storage):
    if get_settings().app_env not in {"local", "test"}:
        raise ValueError("Demo refresh is local/test only")
    if db.bind.url.database not in {"payment_module", "payment_module_test"}:
        raise ValueError("Refusing an unrecognized database")
    users = {}
    primary = {
        "requestor": "requestor",
        "department_head": "department.head",
        "finance_associate": "finance.associate",
        "finance_manager": "finance.manager",
        "coo": "coo",
        "president": "president",
        "board_member": "board.member",
    }
    for user, role in db.execute(
        select(User, Role.code)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .where(User.is_active.is_(True))
    ):
        if user.email == primary.get(role, "") + "@payment.local":
            users.setdefault(role, user)
    roles = {"requestor", "department_head", "finance_associate", "finance_manager", "coo", "president", "board_member"}
    if not roles <= users.keys():
        raise ValueError("Expected development role accounts are missing")
    center = db.scalar(select(CostCenter).where(CostCenter.code == "MKTG"))
    if not center or center.approver_user_id != users["department_head"].id:
        raise ValueError("Configure the Marketing Department Head before refreshing samples")
    setup = active_configuration(db)
    if not setup or setup.configuration.get("scope") != "all":
        raise ValueError("Finance all-type setup must already be active; refresh never activates it")
    old = list(
        db.scalars(
            select(PaymentRequest).where(
                True if replace_all else PaymentRequest.type_data["development_seed"].astext.is_not(None)
            )
        )
    )
    for item in old:
        db.delete(item)
    db.flush()
    flag = db.scalar(select(SystemSetting).where(SystemSetting.key == "development.demo_catalog"))
    if flag:
        flag.value = CATALOG
    else:
        db.add(SystemSetting(key="development.demo_catalog", value=CATALOG))
    for vendor_id, source, name in [
        ("SHOWCASE-APS-20261117", "aps", "[Demo] Campus Services Partner"),
        (VENDOR_ID, "procurement", "[Demo] Campus Technology Supplies"),
    ]:
        if not db.get(VendorRecord, vendor_id):
            db.add(
                VendorRecord(
                    id=vendor_id,
                    source_system=source,
                    payload={
                        "name": name,
                        "email": "demo@example.test",
                        "contactPerson": "Demo contact",
                        "phone": "00000000000",
                        "branchCode": vendor_id,
                        "informationStatus": "Information complete",
                        "businessDocuments": [],
                        "is_sample": True,
                        "is_active": True,
                        "version": 1,
                    },
                )
            )
    db.flush()
    now = datetime.now(UTC)
    age = now - timedelta(days=5)
    financial_time = now - timedelta(days=1)
    owner, fa, fm = users["requestor"], users["finance_associate"], users["finance_manager"]
    result = []
    source = None

    def doc(item, kind=None, line_id=None, accepted=True):
        document = Document(
            request_id=item.id, line_id=line_id, owner_user_id=owner.id, document_type_id=kind.id if kind else None
        )
        db.add(document)
        db.flush()
        content = sample_pdf(item.purpose[:65])
        sha = hashlib.sha256(content).hexdigest()
        key = f"demo-refresh/{CATALOG}/{item.id}/{document.id}.pdf"
        storage_version = storage.put(key, io.BytesIO(content), "application/pdf", sha)
        version = DocumentVersion(
            document_id=document.id,
            version=1,
            original_filename="fictional-demo-evidence.pdf",
            media_type="application/pdf",
            byte_size=len(content),
            sha256=sha,
            bucket=storage.bucket,
            object_key=key,
            storage_version_id=storage_version,
            uploaded_by_user_id=owner.id,
            created_at=age,
        )
        db.add(version)
        if accepted:
            db.add(
                DocumentReviewDecision(
                    document_id=document.id,
                    decision="accepted",
                    actor_user_id=fa.id,
                    comment="Fictional demonstration evidence accepted",
                    created_at=age,
                )
            )
            db.add(
                DocumentHardCopyEvent(
                    document_id=document.id,
                    status="received",
                    actor_user_id=fa.id,
                    note="Necessary sample documents received",
                    created_at=age,
                )
            )
        if line_id:
            line = db.get(PaymentRequestLine, line_id)
            line.attachment_refs = [*line.attachment_refs, version.original_filename]
        db.flush()
        return version

    def workflow(item, state):
        policy = route_for(
            request_type=item.request_type,
            budgeted=item.type_data["budgeted"],
            amount=item.gross_amount,
            currency_code="PHP",
            php_per_unit=1,
        )
        stages = [{"code": r.code, "role": r.role, "purpose": r.purpose} for r in policy.stages]
        current = next((i for i, step in enumerate(stages) if step["role"] == state), None)
        if state in {"returned", "declined"}:
            current = 1
        if state == "finance_response":
            current = 2
        approved = current is None
        snapshot = {
            "request_version": 1,
            "request_type": item.request_type,
            "budgeted": policy.budgeted,
            "amount": str(item.gross_amount),
            "currency_code": "PHP",
            "php_per_unit": "1",
            "php_amount": str(item.gross_amount),
            "rate_status": "not_applicable",
            "department_id": str(item.department_id),
            "department_approver_id": str(center.approver_user_id),
            "cost_center_id": str(center.id),
            "stages": stages,
        }
        instance = WorkflowInstance(
            request_id=item.id,
            policy_version=policy.policy_version,
            route_snapshot=snapshot,
            state="approved"
            if approved
            else "information_requested"
            if state == "finance_response"
            else state
            if state in {"returned", "declined"}
            else "active",
            current_stage=None if state in {"returned", "declined"} else current,
            version=(len(stages) if approved else current) + 1,
            created_at=age,
        )
        db.add(instance)
        db.flush()
        db.add(
            WorkflowAssignment(
                workflow_id=instance.id, stage_index=0, kind="approval", assigned_user_id=center.approver_user_id
            )
        )
        db.add(
            WorkflowEvent(
                request_id=item.id,
                workflow_id=instance.id,
                actor_user_id=owner.id,
                action="route_started",
                stage_index=0,
                details={"route": snapshot},
                occurred_at=age,
            )
        )
        final_event = None
        for i, stage in enumerate(stages[: len(stages) if approved else current]):
            final_event = WorkflowEvent(
                request_id=item.id,
                workflow_id=instance.id,
                actor_user_id=users[stage["role"]].id,
                action="stage_approved",
                stage_index=i,
                note="Fictional demo approval",
                details={"stage": stage["code"]},
                occurred_at=age + timedelta(hours=i + 1),
            )
            db.add(final_event)
        if state in {"returned", "declined", "finance_response"}:
            db.add(
                WorkflowEvent(
                    request_id=item.id,
                    workflow_id=instance.id,
                    actor_user_id=fa.id if current == 1 else fm.id,
                    action="information_requested" if state == "finance_response" else state,
                    stage_index=current,
                    note="Please clarify the sample evidence before continuing"
                    if state != "declined"
                    else "Duplicate demonstration purchase",
                    details={
                        "stage": stages[current]["code"],
                        "kind": "finance_return",
                        "return_to_role": "finance_associate",
                        "response_role": "finance_associate",
                    }
                    if state == "finance_response"
                    else {},
                    occurred_at=age + timedelta(hours=4),
                )
            )
        db.flush()
        return instance, final_event

    prefixes = {
        "general": "GEN",
        "reimbursement": "RMB",
        "cashAdvance": "CA",
        "liquidation": "LIQ",
        "poPayment": "PO",
        "pettyCash": "PC",
    }
    for index, (kind, state, title, amount, budgeted) in enumerate(scenarios(), 1):
        draft = state in {"draft", "documents"}
        data = {"development_seed": f"{CATALOG}/{index:02d}", "demo_scenario": state, "budgeted": budgeted}
        if state == "documents":
            data["demo_current_step"] = 2
        if kind == "cashAdvance":
            data.update(
                event_end_date=(now.date() + timedelta(days=5)).isoformat(),
                liquidation_due_date=(now.date() + timedelta(days=20)).isoformat(),
                cash_advance_acknowledged=True,
            )
        if kind == "liquidation":
            data.update(
                cash_advance_reference=source.request_number,
                liquidation_advance_amount=str(source.gross_amount),
                liquidation_due_date=now.date().isoformat(),
                actual_liquidation_date=now.date().isoformat(),
            )
        if kind == "poPayment":
            po = purchase_orders()[{"finance_manager": 0, "voucher_draft": 1, "partial": 2, "reversed": 3}[state]]
            data.update(
                po_reference=po["poNumber"], procurement_snapshot={"captured_at": age.isoformat(), "purchase_order": po}
            )
        item = PaymentRequest(
            request_type=kind,
            request_number=None if draft else f"{prefixes[kind]}-{now.year}-{970000 + index}",
            requestor_id=owner.id,
            department_id=center.department_id,
            status="draft"
            if draft
            else "returned"
            if state == "returned"
            else "declined"
            if state == "declined"
            else "submitted",
            currency_code="PHP",
            gross_amount=Decimal(amount),
            version=1,
            purpose="[DEMO] " + title,
            payee_name="[Demo] Campus Technology Supplies"
            if kind == "poPayment"
            else owner.display_name
            if kind in {"reimbursement", "cashAdvance", "liquidation"}
            else "[Demo] Campus Services Partner",
            vendor_external_id=VENDOR_ID
            if kind == "poPayment"
            else "SHOWCASE-APS-20261117"
            if kind == "general"
            else None,
            type_data=data,
            submitted_at=None if draft else age,
            created_at=age,
            updated_at=now,
        )
        db.add(item)
        db.flush()
        accounts, mapped_center = (
            mapping_for_department(db, setup, item.department_id, kind) if kind != "pettyCash" else ({}, center)
        )
        amounts = (
            [Decimal(amount)] if state != "approved" or kind != "general" else [Decimal("56000"), Decimal("11200")]
        )
        lines = []
        for pos, value in enumerate(amounts, 1):
            row = PaymentRequestLine(
                request_id=item.id,
                position=pos,
                particulars=title
                if len(amounts) == 1
                else ["Maintenance services - 2% EWT", "Supplies - 1% EWT"][pos - 1],
                amount=value,
                currency_code="PHP",
                vendor_name=item.payee_name,
                cost_center_id=mapped_center.id,
                chart_account_id=accounts["debit"].id if accounts else None,
                invoice_date=now.date() - timedelta(days=6),
                invoice_number=f"DEMO-INV-{index:02d}-{pos}",
                attachment_refs=[],
            )
            db.add(row)
            lines.append(row)
        db.flush()
        if kind != "pettyCash":
            save_coding(db, item, setup)
        ready = state not in {"draft", "documents", "department_head", "finance_associate", "returned"}
        if not draft:
            rules = list(
                db.scalars(
                    select(DocumentRequirementRule).where(
                        DocumentRequirementRule.request_type == kind,
                        DocumentRequirementRule.is_active.is_(True),
                        DocumentRequirementRule.is_required.is_(True),
                    )
                )
            )
            for rule in rules:
                dtype = db.get(DocumentType, rule.document_type_id)
                for target in lines if rule.scope == "line" else [None]:
                    for _ in range(rule.minimum_count):
                        doc(item, dtype, target.id if target else None, ready)
            if not rules:
                doc(item, accepted=ready)
            for row in lines:
                if not row.attachment_refs:
                    doc(item, line_id=row.id, accepted=ready)
        tax = None
        if ready and kind != "pettyCash":
            override = {}
            if len(lines) > 1:
                one = db.scalar(select(TaxCode).where(TaxCode.code == "VAT12-EWT1"))
                override[str(lines[1].id)] = str(one.id)
            calc = build_calculation(db, item, setup.configuration, line_overrides=override)
            calc["assigned_by"] = fa.display_name
            tax = FinanceTaxSnapshot(
                request_id=item.id,
                request_version=1,
                version=1,
                command_key=str(uuid4()),
                payload_hash="d" * 64,
                result=calc,
                reason="Fictional sample uses existing Finance settings",
                actor_user_id=fa.id,
                created_at=age + timedelta(hours=2),
            )
            db.add(tax)
        if ready:
            for row in lines:
                db.add(
                    FinanceLineReview(
                        request_id=item.id,
                        line_id=row.id,
                        request_version=1,
                        decision="accepted",
                        physical_original_received=True,
                        reason="Necessary demonstration documents received",
                        actor_user_id=fa.id,
                        created_at=age + timedelta(hours=2),
                    )
                )
        db.flush()
        instance, final = (None, None) if draft else workflow(item, state)
        if final and kind == "poPayment":
            queue_approval(db, final)
        voucher = None
        if state in {
            "voucher_draft",
            "issued",
            "prepared",
            "partial",
            "released",
            "cleared",
            "complete",
            "reversed",
            "advance_source",
            "return_pending",
            "return_verified",
        }:
            journal = FinanceJournalSnapshot(
                request_id=item.id,
                request_version=1,
                tax_snapshot_id=tax.id,
                version=1,
                state="posted",
                command_key=str(uuid4()),
                payload_hash="d" * 64,
                result=build_entries(db, item, tax, strict=True),
                reason="Fictional posted demonstration",
                actor_user_id=fm.id,
                created_at=financial_time,
            )
            db.add(journal)
            db.flush()
            vr = {
                "request_number": item.request_number,
                "payee": item.payee_name,
                "purpose": item.purpose,
                "currency": "PHP",
                "journal_version": 1,
                "request_version": 1,
                "tax_version": 1,
                "entries": journal.result["entries"],
                "totals": tax.result["totals"],
                "request_type": kind,
                "advance_source": tax.result.get("advance_source"),
                "prepared_by": fa.display_name,
                "certification_text": "FICTIONAL DEMO - Finance acceptance pending",
                "status": "draft",
                "payment_authorization": "pending",
            }
            voucher = FinanceVoucherDraft(
                request_id=item.id,
                journal_id=journal.id,
                command_key=str(uuid4()),
                payload_hash="d" * 64,
                result=vr,
                reason="Fictional voucher preparation",
                actor_user_id=fa.id,
                created_at=age + timedelta(hours=2),
            )
            db.add(voucher)
            db.flush()
            if state != "voucher_draft":
                number = f"PV-DEMO-{now.year}-{970000 + index:08d}"
                approvals = [
                    {
                        "action": e.action,
                        "note": e.note,
                        "occurred_at": e.occurred_at.isoformat(),
                        "actor": db.get(User, e.actor_user_id).display_name,
                    }
                    for e in db.scalars(
                        select(WorkflowEvent)
                        .where(WorkflowEvent.workflow_id == instance.id, WorkflowEvent.action == "stage_approved")
                        .order_by(WorkflowEvent.stage_index)
                    )
                ]
                issued = {
                    **vr,
                    "voucher_number": number,
                    "issued_on": now.date().isoformat(),
                    "certified_by": fm.display_name,
                    "approval_history": approvals,
                    "voucher_setup_version": 1,
                    "status": "issued",
                }
                db.add(
                    FinanceVoucherEvent(
                        request_id=item.id,
                        voucher_id=voucher.id,
                        version=1,
                        state="issued",
                        voucher_number=number,
                        command_key=str(uuid4()),
                        payload_hash="d" * 64,
                        result=issued,
                        reason="Fictional certification",
                        actor_user_id=fm.id,
                        created_at=financial_time,
                    )
                )
                item.voucher_number = number
                if state != "issued":
                    due = Decimal(tax.result["totals"]["amount_due"])
                    pay_amounts = [Decimal("60000"), due - Decimal("60000")] if state == "partial" else [due]
                    for sequence, value in enumerate(pay_amounts, 1):
                        method = db.scalar(select(PaymentMethod).where(PaymentMethod.code == "BANK_TRANSFER"))
                        info = {
                            "method": "Bank transfer",
                            "method_category": "bank_transfer",
                            "reference": f"DEMO-PAY-{index:02d}-{sequence}",
                            "amount": str(value),
                            "currency": "PHP",
                            "prepared_by": fa.display_name,
                            "label": "Fictional installment",
                        }
                        instruction = PaymentInstruction(
                            voucher_id=voucher.id,
                            request_id=item.id,
                            preparer_user_id=fa.id,
                            method_id=method.id,
                            reference=info["reference"],
                            sequence=sequence,
                            amount=value,
                            currency_code="PHP",
                            result=info,
                            created_at=financial_time + timedelta(hours=2),
                        )
                        db.add(instruction)
                        db.flush()
                        transitions = ["prepared"]
                        if state != "prepared" and not (state == "partial" and sequence == 2):
                            transitions += ["released"]
                        if state in {"cleared", "complete"}:
                            transitions += ["cleared"]
                        if state == "reversed":
                            transitions += ["recovery_pending", "reversed"]
                        for version, transition in enumerate(transitions, 1):
                            details = {
                                **info,
                                "actor_name": fm.display_name
                                if transition in {"cleared", "reversed"}
                                else fa.display_name,
                                "recorded_on": now.date().isoformat(),
                            }
                            if transition in {"released", "cleared", "recovery_pending"}:
                                evidence = doc(item)
                                evidence_kind = {
                                    "released": "release",
                                    "cleared": "clearing",
                                    "recovery_pending": "recovery",
                                }[transition]
                                pe = PaymentEvidence(
                                    instruction_id=instruction.id,
                                    document_version_id=evidence.id,
                                    kind=evidence_kind,
                                    command_key=str(uuid4()),
                                    payload_hash="d" * 64,
                                    actor_user_id=fa.id,
                                )
                                db.add(pe)
                                db.flush()
                                details["evidence_id"] = str(pe.id)
                            if transition == "recovery_pending":
                                details.update(prior_state="released", recovered_amount=str(value))
                            db.add(
                                PaymentLineEvent(
                                    instruction_id=instruction.id,
                                    version=version,
                                    state=transition,
                                    command_key=str(uuid4()),
                                    payload_hash="d" * 64,
                                    result=details,
                                    reason="Fictional demonstration payment",
                                    actor_user_id=fm.id if transition in {"cleared", "reversed"} else fa.id,
                                    created_at=financial_time + timedelta(hours=2 + version),
                                )
                            )
                    db.add(
                        FinanceVoucherEvent(
                            request_id=item.id,
                            voucher_id=voucher.id,
                            version=2,
                            state="payment_prepared",
                            command_key=str(uuid4()),
                            payload_hash="d" * 64,
                            result={"actor_name": fa.display_name},
                            reason="Fictional payment schedule",
                            actor_user_id=fa.id,
                            created_at=financial_time + timedelta(hours=2),
                        )
                    )
        if state in {"return_pending", "return_verified"}:
            evidence = doc(item)
            from .fund_returns import full_advance_source

            details = {
                "document_id": str(evidence.document_id),
                "document_version_id": str(evidence.id),
                "filename": evidence.original_filename,
                "sha256": evidence.sha256,
                "recorded_on": now.date().isoformat(),
                "reference": f"DEMO-RETURN-{index}",
                "receiving_office": "Demo Finance Office",
                "received_by": fa.display_name,
                "received_by_id": str(fa.id),
                "advance_source": full_advance_source(item, voucher),
                "currency": "PHP",
                "receiving_account": tax.result["configuration"].get("credit_account"),
                "entirely_unused": True,
            }
            for version, status in enumerate(
                ["recorded", "verified"] if state == "return_verified" else ["recorded"], 1
            ):
                db.add(
                    FundReturnEvent(
                        voucher_id=voucher.id,
                        version=version,
                        state=status,
                        amount=item.gross_amount,
                        command_key=str(uuid4()),
                        payload_hash="d" * 64,
                        result=details,
                        reason="Fictional full unused advance return",
                        actor_user_id=fa.id if status == "recorded" else fm.id,
                        created_at=financial_time + timedelta(hours=8 + version),
                    )
                )
        if state == "petty_voucher":
            number = f"PCV-DEMO-{now.year}-{index:05d}"
            db.add(
                PettyCashVoucher(
                    request_id=item.id,
                    voucher_number=number,
                    command_key=str(uuid4()),
                    payload_hash="d" * 64,
                    result={
                        "voucher_number": number,
                        "request_number": item.request_number,
                        "request_type": "pettyCash",
                        "request_version": 1,
                        "payee": item.payee_name,
                        "purpose": item.purpose,
                        "currency": "PHP",
                        "amount": str(item.gross_amount),
                        "amount_due": str(item.gross_amount),
                        "tax": "0.00",
                        "department": center.name,
                        "issued_on": now.date().isoformat(),
                        "issued_by": fa.display_name,
                        "reason": "Fictional Petty Cash voucher",
                        "lines": [{"position": 1, "particulars": title, "amount": str(item.gross_amount)}],
                        "approvals": [],
                    },
                    actor_user_id=fa.id,
                )
            )
            item.voucher_number = number
        if state == "complete":
            item.status = "archived"
        db.flush()
        if kind == "poPayment" and voucher:
            queue_financial_update(db, item, f"demo:{item.id}", now)
        if state == "advance_source":
            source = item
        if not draft:
            reviewer = (
                users[instance.route_snapshot["stages"][instance.current_stage]["role"]]
                if instance.current_stage is not None
                else fa
            )
            for n, (author, body) in enumerate(
                [
                    (owner, "Please review this fictional demonstration request and its supporting documents."),
                    (
                        reviewer,
                        f"@{owner.display_name} The sample shows "
                        + state.replace("_", " ")
                        + ". Review the labelled amounts before taking the next action.",
                    ),
                ]
            ):
                message = RequestConversationMessage(
                    request_id=item.id,
                    author_user_id=author.id,
                    idempotency_key=str(uuid4()),
                    body=body,
                    created_at=now - timedelta(hours=2 - n),
                )
                db.add(message)
                db.flush()
                if n == 1 and author.id != owner.id:
                    db.add(
                        RequestMentionNotification(
                            request_id=item.id,
                            message_id=message.id,
                            recipient_user_id=owner.id,
                            created_at=message.created_at,
                        )
                    )
            db.flush()
        result.append(
            {
                "id": str(item.id),
                "number": item.request_number or "Draft",
                "type": kind,
                "scenario": state,
                "purpose": item.purpose,
            }
        )
    db.flush()
    return {"removed": len(old), "created": len(result), "catalog": CATALOG, "requests": result}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--replace", choices=["all", "marked"], required=True)
    parser.add_argument("--apply", action="store_true", required=True)
    args = parser.parse_args()
    with SessionLocal.begin() as db:
        result = populate(db, replace_all=args.replace == "all", storage=get_storage())
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
