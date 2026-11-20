from decimal import Decimal
from types import SimpleNamespace as Row
from unittest import TestCase
from unittest.mock import MagicMock, patch

from payment_module.advance_settlement import outstanding_liquidations, settled_advance_references


class OutstandingLiquidationsTests(TestCase):
    def test_only_released_unsettled_advances_are_flagged(self):
        sources = [Row(id=i, request_number=f"CA-{i}", gross_amount=Decimal("5000"), currency_code="PHP", type_data={"liquidation_due_date": "2026-12-05"}) for i in range(4)]
        db = MagicMock()
        db.scalars.return_value = sources
        with patch("payment_module.advance_settlement.settled_advance_references", return_value={"CA-1"}), patch("payment_module.payment_execution.request_payment_summaries", return_value={0: {"released": "5000"}, 1: {"released": "5000"}, 2: {"released": "0"}, 3: {"released": "100"}}):
            result = outstanding_liquidations(db, "owner")
        self.assertEqual([row["request_number"] for row in result], ["CA-0", "CA-3"])
        self.assertEqual(set(result[0]), {"request_number", "amount", "currency_code", "liquidation_due_date"})
        query = str(db.scalars.call_args.args[0])
        self.assertIn("requestor_id", query)
        self.assertIn("request_type", query)
        self.assertIn("status", query)

    def test_no_advances_requires_no_settlement_queries(self):
        db = MagicMock()
        db.scalars.return_value = []
        with patch("payment_module.advance_settlement.settled_advance_references") as settled:
            self.assertEqual(outstanding_liquidations(db, "owner"), [])
            settled.assert_not_called()

    def test_submitted_liquidation_is_not_settlement_until_posted_and_cash_return_resolved(self):
        for state, pending, expected in [("draft", "0", set()), ("reversed", "0", set()), ("posted", "10", set()), ("posted", "0", {"CA-1"})]:
            with self.subTest(state=state, pending=pending):
                db = MagicMock()
                db.scalars.side_effect = [[Row(id="advance", request_number="CA-1")], [Row(id="liquidation", type_data={"cash_advance_reference": "CA-1"})]]
                db.scalar.side_effect = [None, Row(state=state, result={"tax_totals": {"advance_applied": "5000", "cash_return_pending": pending}}), None]
                self.assertEqual(settled_advance_references(db, "owner"), expected)
