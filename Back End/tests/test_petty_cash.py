from decimal import Decimal
from uuid import uuid4
import pytest
from sqlalchemy import select
from payment_module.database import SessionLocal
from payment_module.models import PaymentRequest, FinanceVoucherDraft, FinanceJournalSnapshot
from payment_module.workflow_policy import route_for, PolicyCannotRoute
from payment_module.seed import seed
from test_payment_requests import payload
from test_workflow_approvals import login, accept_finance_line


@pytest.mark.parametrize("amount,budgeted",[("500",True),("1250000",False)])
def test_petty_cash_route_ends_with_finance_associate(amount,budgeted):
    route=route_for(request_type="pettyCash",budgeted=budgeted,amount=Decimal(amount),currency_code="PHP")
    assert [s.role for s in route.stages] == ["department_head","finance_associate"]
    with pytest.raises(PolicyCannotRoute):
        route_for(request_type="pettyCash",budgeted=True,amount=Decimal("500"),currency_code="USD",php_per_unit=Decimal("58"))


def test_petty_cash_submission_approval_and_no_downstream_finance(client):
    seed()
    headers=login(client,"requestor@payment.local")
    data=payload();data.update(request_type="pettyCash",purpose="Petty cash supplies")
    data["type_data"]={"budgeted":True}
    data["lines"][0]["attachment_refs"]=[]
    created=client.post("/api/v1/requests",json=data,headers=headers)
    assert created.status_code==201,created.text
    item=created.json();request_id=item["id"]
    submitted=client.post(f"/api/v1/requests/{request_id}/submit",json={"version":item["version"]},headers={**headers,"Idempotency-Key":str(uuid4())})
    assert submitted.status_code==200,submitted.text
    assert not submitted.json()["voucher_number"]
    head=login(client,"department.head@payment.local")
    approved=client.post(f"/api/v1/workflow/{request_id}/approve",json={"version":1},headers={**head,"Idempotency-Key":str(uuid4())})
    assert approved.status_code==200,approved.text
    assert approved.json()["current_stage"]==1
    fa=login(client,"finance.associate@payment.local")
    assert client.post(f"/api/v1/workflow/{request_id}/approve",json={"version":2},headers={**fa,"Idempotency-Key":str(uuid4())}).status_code==409
    accept_finance_line(client,request_id,fa)
    final=client.post(f"/api/v1/workflow/{request_id}/approve",json={"version":2},headers={**fa,"Idempotency-Key":str(uuid4())})
    assert final.status_code==200,final.text
    assert final.json()["state"]=="approved" and final.json()["current_stage"] is None
    result=client.get(f"/api/v1/requests/{request_id}").json()
    assert not result["voucher_number"]
    listed=next(row for row in client.get("/api/v1/requests").json() if row["id"]==request_id)
    assert listed["display_status"]=="Approved"
    assert client.get(f"/api/v1/finance-tax/{request_id}").status_code==409
    assert client.get(f"/api/v1/finance-accounting/{request_id}").status_code==409
    assert client.get(f"/api/v1/finance-vouchers/{request_id}").status_code==409
    dashboard=client.get("/api/v1/reports/dashboard").json()
    assert request_id not in dashboard["membership"]["open"]
    login(client,"finance.manager@payment.local")
    report=client.get("/api/v1/reports/requests?request_type=pettyCash").json()
    assert any(row["request_id"]==request_id and row["status"]=="Approved" for row in report["items"])
    payments=client.get("/api/v1/reports/finance?kind=payments").json()
    assert not any(row["request_id"]==request_id for row in payments["items"])
    with SessionLocal() as db:
        assert db.scalar(select(FinanceVoucherDraft).where(FinanceVoucherDraft.request_id==request_id)) is None
        assert db.scalar(select(FinanceJournalSnapshot).where(FinanceJournalSnapshot.request_id==request_id)) is None
    client.cookies.clear();headers=login(client,"requestor@payment.local")
    data["currency_code"]="USD";data["lines"][0]["currency_code"]="USD"
    assert client.post("/api/v1/requests",json=data,headers=headers).status_code==422


@pytest.mark.parametrize("decision",["return","decline"])
def test_petty_cash_finance_rejection_and_return_resume(client,decision):
    seed();headers=login(client,"requestor@payment.local");data=payload()
    data.update(request_type="pettyCash",purpose="Petty cash correction test");data["type_data"]={"budgeted":True};data["lines"][0]["attachment_refs"]=[]
    created=client.post("/api/v1/requests",json=data,headers=headers).json();rid=created["id"]
    assert client.post(f"/api/v1/requests/{rid}/submit",json={"version":created["version"]},headers={**headers,"Idempotency-Key":str(uuid4())}).status_code==200
    head=login(client,"department.head@payment.local")
    assert client.post(f"/api/v1/workflow/{rid}/approve",json={"version":1},headers={**head,"Idempotency-Key":str(uuid4())}).status_code==200
    fa=login(client,"finance.associate@payment.local")
    rejected=client.post(f"/api/v1/workflow/{rid}/reject",json={"version":2,"decision":decision,"note":"Missing clarification"},headers={**fa,"Idempotency-Key":str(uuid4())})
    assert rejected.status_code==200,rejected.text
    owner=login(client,"requestor@payment.local")
    current=client.get(f"/api/v1/requests/{rid}").json()
    if decision=="return":
        resubmitted=client.post(f"/api/v1/requests/{rid}/resubmit",json={"version":current["version"],"note":"Clarification supplied"},headers={**owner,"Idempotency-Key":str(uuid4())})
        assert resubmitted.status_code==200,resubmitted.text
        route=client.get(f"/api/v1/workflow/{rid}").json()
        assert route["current_stage"]==1 and len(route["route"]["stages"])==2
        assert not resubmitted.json()["voucher_number"]
    else:
        assert current["status"]=="declined"
    login(client,"coo@payment.local")
    assert client.get(f"/api/v1/finance-accounting/{rid}").status_code==404
    assert client.get(f"/api/v1/finance-vouchers/{rid}").status_code==404
