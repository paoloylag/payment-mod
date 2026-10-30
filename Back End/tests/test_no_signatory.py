import pytest
from test_payment_execution import (payment_voucher, schedule, action, evidence, view)
from test_finance_vouchers import prepared_voucher
from test_finance_accounting import accounting_request
from test_finance_tax import setup_tax
from test_finance_validation import login
from uuid import uuid4


@pytest.mark.parametrize("method", ["BANK_TRANSFER", "CASH", "CHECK"])
def test_finance_releases_without_signatory(client, payment_voucher, method):
    request_id, _, methods = payment_voucher
    rows = [{"label": "Direct Finance release", "amount": "1100.00", "method_id": methods[method], "reference": str(uuid4())}]
    result = schedule(client, request_id, rows)
    assert result.status_code == 200, result.text
    item = view(client, request_id)["lines"][0]
    assert not item["can_authorize"]
    assert action(client, request_id, item["id"], "authorize", 1, email="finance.associate@payment.local").status_code == 410
    assert action(client, request_id, item["id"], "release", 1).status_code == 409
    version = 1
    if method == "CHECK":
        pickup = action(client, request_id, item["id"], "pickup-ready", 1)
        assert pickup.status_code == 200, pickup.text
        version = 2
    receipt = evidence(client, request_id, item["id"], "release")
    assert receipt.status_code == 200, receipt.text
    released = action(client, request_id, item["id"], "release", version, {"evidence_id": receipt.json()["id"], "bank_name": "Test Bank", "recipient_name": "Payee"})
    assert released.status_code == 200, released.text
    assert view(client, request_id)["lines"][0]["state"] == "released"
