import unittest
from types import SimpleNamespace as Obj

from payment_module.procurement_financials import calculation_projection


class FinancialProjectionTests(unittest.TestCase):
    def test_gross_vat_ewt_and_net_with_different_line_rates(self):
        lines = []
        for position, rate, base, ewt, due in [
            (1, "2", "50000.00", "1000.00", "55000.00"),
            (2, "1", "10000.00", "100.00", "11100.00"),
        ]:
            lines.append(
                {
                    "line_id": str(position),
                    "position": position,
                    "gross": "56000.00" if position == 1 else "11200.00",
                    "vat": "6000.00" if position == 1 else "1200.00",
                    "ewt_base": base,
                    "ewt_tax": {"ewt_rate": rate, "ewt_classification": "Services", "bankPrivate": "DO-NOT-SEND"},
                    "ewt": ewt,
                    "amount_due": due,
                    "particulars": "PRIVATE NOTE",
                }
            )
        snapshot = Obj(
            request_version=2,
            version=3,
            result={
                "totals": {"gross": "67200.00", "vat": "7200.00", "ewt": "1100.00", "amount_due": "66100.00"},
                "lines": lines,
                "privateNotes": "DO-NOT-SEND",
            },
        )
        result = calculation_projection(snapshot, 2)
        self.assertEqual(result["totals"]["netPayable"], "66100.00")
        self.assertEqual(result["lines"][0]["ewtRate"], "2")
        self.assertEqual(result["lines"][1]["ewtRate"], "1")
        self.assertNotIn("DO-NOT-SEND", str(result))
        self.assertNotIn("PRIVATE NOTE", str(result))

    def test_missing_or_stale_calculation_is_not_zero_tax(self):
        self.assertIsNone(calculation_projection(None, 2)["totals"])
        stale = calculation_projection(Obj(request_version=1, version=3), 2)
        self.assertEqual(stale["status"], "stale")
        self.assertIsNone(stale["totals"])
