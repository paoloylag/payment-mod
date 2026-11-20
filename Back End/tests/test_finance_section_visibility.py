# ruff: noqa: F811
from test_finance_accounting import accounting_request  # noqa: F401
from test_finance_tax import setup_tax  # noqa: F401
from test_finance_validation import advance_to_finance, login, submitted_request
from test_finance_vouchers import prepared_voucher  # noqa: F401


def test_future_finance_sections_hidden_until_reached(client):
    rid, _ = submitted_request()
    login(client, "finance.associate@payment.local")
    before = client.get(f"/api/v1/workflow/{rid}")
    assert before.status_code == 200
    assert before.json()["finance_sections"] == {"tax": False, "accounting": False, "voucher": False}
    advance_to_finance(client, rid)
    login(client, "finance.associate@payment.local")
    assert client.get(f"/api/v1/workflow/{rid}").json()["finance_sections"] == {
        "tax": True,
        "accounting": True,
        "voucher": False,
    }
    login(client, "finance.manager@payment.local")
    assert client.get(f"/api/v1/workflow/{rid}").json()["finance_sections"] == {
        "tax": False,
        "accounting": False,
        "voucher": False,
    }
    login(client, "requestor@payment.local")
    assert client.get(f"/api/v1/workflow/{rid}").json()["finance_sections"] == {
        "tax": True,
        "accounting": False,
        "voucher": False,
    }


def test_final_approval_exposes_voucher_to_reached_finance(client, prepared_voucher):
    rid, *_ = prepared_voucher
    login(client, "finance.associate@payment.local")
    assert client.get(f"/api/v1/workflow/{rid}").json()["finance_sections"] == {
        "tax": True,
        "accounting": True,
        "voucher": True,
    }
