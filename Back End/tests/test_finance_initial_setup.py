import json

import pytest
from payment_module.database import SessionLocal
from payment_module.finance_readiness import effective, finance_date
from payment_module.models import ChartAccount, CostCenter, Department, SystemSetting
from payment_module.routers.finance_setup import REVIEW_AREAS
from sqlalchemy import delete, select
from test_all_type_payments import all_setup  # noqa: F401
from test_finance_accounting import accounting_request  # noqa: F401
from test_finance_tax import setup_tax  # noqa: F401
from test_finance_validation import login


@pytest.fixture()
def ready_setup(client, all_setup):  # noqa: F811
    from uuid import uuid4

    centers_added = []
    with SessionLocal.begin() as db:
        centers = list(db.scalars(select(CostCenter)))
        for department in db.scalars(select(Department).where(Department.is_active.is_(True))):
            if not any(row.department_id == department.id and effective(row, finance_date()) for row in centers):
                row = CostCenter(
                    code=f"INI-{uuid4().hex[:8]}", name="Initial setup test center", department_id=department.id
                )
                db.add(row)
                db.flush()
                centers_added.append(row.id)
    try:
        yield all_setup
    finally:
        with SessionLocal.begin() as db:
            db.execute(
                delete(SystemSetting).where(
                    SystemSetting.key == f"finance.business_acceptance.{all_setup[4]['version']}"
                )
            )
            if centers_added:
                db.execute(delete(CostCenter).where(CostCenter.id.in_(centers_added)))


def test_acceptance_requires_review_and_is_bound_to_saved_activation(client, ready_setup):
    version = ready_setup[4]["version"]
    url = "/api/v1/request-settings/finance-setup/business-acceptance"
    body = {
        "configuration_version": version,
        "reason": "Reviewed all initial setup scenarios",
        "reviewed_areas": {key: True for key in REVIEW_AREAS},
    }
    manager = login(client, "finance.manager@payment.local")
    status = client.get("/api/v1/request-settings/finance-setup").json()["initial_setup"]
    assert status["status"] == "business_review", status
    assert client.post(url, headers=manager, json={**body, "reviewed_areas": {}}).status_code == 422
    assert client.post(url, headers=manager, json={**body, "configuration_version": version + 1}).status_code == 409
    for email in ("finance.associate@payment.local", "admin@payment.local", "requestor@payment.local"):
        assert client.post(url, headers=login(client, email), json=body).status_code == 403
    manager = login(client, "finance.manager@payment.local")
    accepted = client.post(url, headers=manager, json=body)
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["initial_setup"]["status"] == "complete"
    record = accepted.json()["initial_setup"]["acceptance"]
    assert record["configuration_version"] == version and record["reviewer"] == "Carlo Mendoza"
    assert client.post(url, headers=manager, json=body).json()["initial_setup"]["acceptance"] == record
    assert client.post(url, headers=manager, json={**body, "reason": "Different"}).status_code == 409
    login(client, "requestor@payment.local")
    assert client.get("/api/v1/request-settings/finance-setup").json()["initial_setup"]["acceptance"] is None
    manager = login(client, "finance.manager@payment.local")
    draft = client.get("/api/v1/request-settings/finance-setup").json()
    changed = client.put(
        "/api/v1/request-settings/finance-setup",
        headers=manager,
        json={**draft, "voucher": {**draft["voucher"], "certification_text": "Revised certification"}},
    )
    assert changed.status_code == 200
    assert changed.json()["initial_setup"]["status"] == "changes_pending"
    assert client.post(url, headers=manager, json=body).status_code == 409
    with SessionLocal() as db:
        saved = db.scalar(select(SystemSetting).where(SystemSetting.key == f"finance.business_acceptance.{version}"))
        assert json.loads(saved.value) == record


def test_invalid_active_references_block_business_acceptance(client, ready_setup):
    _, _, _, asset_id, setup = ready_setup
    with SessionLocal.begin() as db:
        db.get(ChartAccount, asset_id).is_active = False
    manager = login(client, "finance.manager@payment.local")
    status = client.get("/api/v1/request-settings/finance-setup").json()["initial_setup"]
    assert not status["configuration_ready"]
    response = client.post(
        "/api/v1/request-settings/finance-setup/business-acceptance",
        headers=manager,
        json={
            "configuration_version": setup["version"],
            "reason": "Review",
            "reviewed_areas": {key: True for key in REVIEW_AREAS},
        },
    )
    assert response.status_code == 409
