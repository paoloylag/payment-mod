from payment_module.database import SessionLocal
from payment_module.demo_refresh import populate, sample_pdf
from payment_module.demo_scenarios import scenarios
from payment_module.models import FinanceConfiguration, PaymentRequest, ProcurementApprovalEvent, WorkflowInstance
from sqlalchemy import func, select
from test_all_type_payments import all_setup  # noqa: F401
from test_finance_accounting import accounting_request  # noqa: F401
from test_finance_tax import setup_tax  # noqa: F401


class SampleStorage:
    bucket = "demo-test-only"

    def __init__(self):
        self.objects = {}

    def put(self, key, fileobj, media_type, checksum):
        self.objects[key] = fileobj.read()
        return None


def test_catalog_has_every_approver_and_stage():
    states = {row[1] for row in scenarios()}
    assert {
        "draft",
        "documents",
        "department_head",
        "finance_associate",
        "finance_manager",
        "coo",
        "president",
        "board_member",
        "approved",
        "voucher_draft",
        "issued",
        "prepared",
        "partial",
        "released",
        "cleared",
        "complete",
        "returned",
        "declined",
        "finance_response",
        "reversed",
        "return_pending",
        "return_verified",
        "petty_approved",
        "petty_voucher",
    } <= states
    assert sample_pdf("Demo").startswith(b"%PDF-1.4")
    assert b"xref" in sample_pdf("Demo")


def test_populate_creates_real_financial_records_without_changing_configuration(client, all_setup):  # noqa: F811
    storage = SampleStorage()
    with SessionLocal() as db:
        before = list(db.scalars(select(FinanceConfiguration.configuration)))
        try:
            result = populate(db, replace_all=False, storage=storage)
            assert result["created"] == len(scenarios())
            ids = [row["id"] for row in result["requests"]]
            from uuid import UUID

            ids = [UUID(value) for value in ids]
            assert db.scalar(select(func.count()).select_from(PaymentRequest).where(PaymentRequest.id.in_(ids))) == len(
                ids
            )
            assert len(storage.objects) > len(ids)
            approved = list(
                db.scalars(
                    select(WorkflowInstance).where(
                        WorkflowInstance.request_id.in_(ids), WorkflowInstance.state == "approved"
                    )
                )
            )
            assert len(approved) >= 10
            assert (
                db.scalar(
                    select(func.count())
                    .select_from(ProcurementApprovalEvent)
                    .where(ProcurementApprovalEvent.request_id.in_(ids))
                )
                >= 6
            )
            assert list(db.scalars(select(FinanceConfiguration.configuration))) == before
        finally:
            db.rollback()
