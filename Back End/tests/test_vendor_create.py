from uuid import uuid4

from payment_module.database import SessionLocal
from payment_module.models import VendorRecord
from payment_module.seed import seed
from sqlalchemy import delete
from test_master_data import login


def test_vendor_create_view_and_permission(client):
    seed()
    session = login(client)
    headers = {"X-CSRF-Token": session.json()["csrf_token"]}
    payload = {
        "name": "Vendor Test " + uuid4().hex,
        "email": "vendor@example.test",
        "branchCode": "TEST",
        "businessDocuments": [{"id": "fixture", "name": "registration.pdf", "kind": "Registration"}],
    }
    created = client.post("/api/v1/vendors", json=payload, headers=headers)
    assert created.status_code == 201, created.text
    item = created.json()
    try:
        assert item["status"] == "active"
        assert item["businessDocuments"] == payload["businessDocuments"]
        assert client.get("/api/v1/vendors/" + item["id"]).json()["email"] == payload["email"]
        assert item["id"] in {v["id"] for v in client.get("/api/v1/vendors").json()}
        assert client.post("/api/v1/vendors", json=payload, headers=headers).status_code == 409
        assert client.post("/api/v1/vendors", json={"name": ""}, headers=headers).status_code == 422
        assert (
            client.post("/api/v1/vendors", json={"name": "Other", "bankAccount": "secret"}, headers=headers).status_code
            == 422
        )
        session = login(client, "requestor@payment.local")
        assert (
            client.post(
                "/api/v1/vendors", json=payload, headers={"X-CSRF-Token": session.json()["csrf_token"]}
            ).status_code
            == 403
        )
    finally:
        with SessionLocal.begin() as db:
            db.execute(delete(VendorRecord).where(VendorRecord.id == item["id"]))
