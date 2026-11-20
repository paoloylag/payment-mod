import json
import unittest
from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace as Obj
from unittest.mock import patch
from uuid import uuid4

from payment_module.procurement_approval_worker import deliver_event, run_batch, send_approval
from payment_module.procurement_events import approval_body


class ApprovalEventTests(unittest.TestCase):
    def fixture(self):
        item = Obj(
            id=uuid4(),
            request_number="POREQ-001",
            request_type="poPayment",
            version=3,
            currency_code="PHP",
            gross_amount=Decimal("1120.00"),
            type_data={
                "po_reference": "PO-001",
                "procurement_snapshot": {
                    "purchase_order": {"id": "provider-id", "poNumber": "PO-001", "bankAccountNumber": "MUST-NOT-LEAK"}
                },
            },
        )
        workflow = Obj(id=uuid4(), version=4, state="approved")
        event = Obj(action="stage_approved", occurred_at=datetime.now(UTC), actor_user_id=uuid4())
        return item, workflow, event

    def test_final_po_payload_is_safe_approval_only(self):
        item, workflow, event = self.fixture()
        body = approval_body(item, workflow, event, uuid4())
        self.assertEqual(body["type"], "aps.po_request.approved")
        self.assertEqual(body["purchaseOrder"]["id"], "provider-id")
        self.assertEqual(body["request"]["grossAmount"], "1120.00")
        encoded = json.dumps(body)
        self.assertNotIn("MUST-NOT-LEAK", encoded)
        self.assertNotIn("settledCents", body)
        self.assertNotIn("closedBy", body)

    def test_intermediate_return_decline_and_other_types_do_not_emit(self):
        for field, value in [("state", "active"), ("state", "information_requested"), ("state", "declined")]:
            item, workflow, event = self.fixture()
            setattr(workflow, field, value)
            self.assertIsNone(approval_body(item, workflow, event, uuid4()))
        for kind in ["general", "reimbursement", "cashAdvance", "liquidation", "pettyCash"]:
            item, workflow, event = self.fixture()
            item.request_type = kind
            self.assertIsNone(approval_body(item, workflow, event, uuid4()))
        item, workflow, event = self.fixture()
        event.action = "returned"
        self.assertIsNone(approval_body(item, workflow, event, uuid4()))

    def test_disabled_worker_does_not_open_database(self):
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(run_batch(), {"state": "not_configured", "delivered": 0})

    def test_retry_keeps_exact_event_body_and_redacts_failure(self):
        event = Obj(body='{"eventId":"stable"}', attempts=0, state="pending")
        sent = []

        def fail(body):
            sent.append(body)
            raise RuntimeError("secret must not be saved")

        now = datetime.now(UTC)
        self.assertFalse(deliver_event(event, fail, now))
        self.assertEqual(event.state, "retry")
        self.assertEqual(event.last_error_code, "delivery_failed")
        self.assertEqual(event.body, sent[0])
        event.attempts = 7
        self.assertFalse(deliver_event(event, fail, now))
        self.assertEqual(event.state, "failed")
        self.assertTrue(deliver_event(event, lambda body: None, now))
        self.assertEqual(event.state, "delivered")
        self.assertEqual(event.delivered_at, now)

    def test_transport_rejects_non_tls_and_closure_target_without_network(self):
        for url in [
            "http://provider.example/approval",
            "https://provider.example/api/integrations/aps/closure",
            "https://user:pass@provider.example/approval",
        ]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                send_approval(url, "x" * 32, '{"eventId":"stable"}')

    def test_sender_requires_matching_acknowledgement(self):
        response = Obj(status=200, read=lambda n: b'{"ok":true,"eventId":"wrong"}')

        class Response:
            def __enter__(self):
                return response

            def __exit__(self, *args):
                pass

        opener = Obj(open=lambda *args, **kwargs: Response())
        with patch("payment_module.procurement_approval_worker.build_opener", return_value=opener):
            with self.assertRaises(ValueError):
                send_approval("https://provider.example/approval", "x" * 32, '{"eventId":"stable"}')
            response.read = lambda n: b'{"ok":true,"eventId":"stable"}'
            send_approval("https://provider.example/approval", "x" * 32, '{"eventId":"stable"}')
