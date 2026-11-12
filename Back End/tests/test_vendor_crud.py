from copy import deepcopy
from uuid import uuid4

import pytest
from payment_module.database import SessionLocal
from payment_module.models import AuditEvent, Department, PaymentRequest, User, VendorRecord
from payment_module.seed import seed
from sqlalchemy import delete, select
from test_master_data import login


@pytest.fixture(autouse=True)
def restore_vendor_records():
    seed()
    with SessionLocal() as db:
        before = {record.id: deepcopy(record.payload) for record in db.scalars(select(VendorRecord))}
    yield
    with SessionLocal.begin() as db:
        db.execute(delete(VendorRecord).where(VendorRecord.id.not_in(list(before))))
        for key, payload in before.items():
            db.get(VendorRecord, key).payload = payload


def headers(client, email="finance.associate@payment.local"):
    result = login(client, email)
    return {"X-CSRF-Token": result.json()["csrf_token"]}


def make_vendor(client, auth):
    result = client.post(
        "/api/v1/vendors",
        headers=auth,
        json={
            "name": f"CRUD vendor {uuid4()}",
            "email": "hello@example.test",
            "branchCode": "MANILA",
            "businessDocuments": [{"id": "registration", "name": "registration.pdf", "kind": "Registration"}],
        },
    )
    assert result.status_code == 201, result.text
    return result.json()


def test_vendor_partial_update_status_version_and_delete_are_audited(client):
    auth = headers(client)
    vendor = make_vendor(client, auth)
    path = f"/api/v1/vendors/{vendor['id']}"
    changed = client.patch(path, headers=auth, json={"phone": "09170000000", "version": 1})
    assert changed.status_code == 200, changed.text
    assert changed.json()["email"] == vendor["email"]
    assert changed.json()["businessDocuments"] == vendor["businessDocuments"]
    assert changed.json()["version"] == 2
    assert client.patch(path, headers=auth, json={"name": "Stale change", "version": 1}).status_code == 409
    assert client.delete(path + "?version=1", headers=auth).status_code == 409
    disabled = client.patch(path, headers=auth, json={"is_active": False, "version": 2})
    assert disabled.json()["status"] == "inactive"
    assert vendor["id"] not in {row["id"] for row in client.get("/api/v1/vendors").json()}
    assert vendor["id"] in {row["id"] for row in client.get("/api/v1/vendors?active_only=false").json()}
    enabled = client.patch(path, headers=auth, json={"is_active": True, "version": 3})
    assert enabled.json()["status"] == "active"
    assert client.delete(path + "?version=4", headers=auth).status_code == 204
    assert client.get(path).status_code == 404
    assert client.patch(path, headers=auth, json={"phone": "123"}).status_code == 404
    assert client.delete(path, headers=auth).status_code == 404
    with SessionLocal() as db:
        events = list(db.scalars(select(AuditEvent).where(AuditEvent.entity_type == "vendor")))
        own = [
            event
            for event in events
            if (event.after_values or event.before_values or {}).get("vendor_id") == vendor["id"]
        ]
        assert {event.action for event in own} == {"vendor.created", "vendor.updated", "vendor.deleted"}
        updated = next(event for event in own if event.action == "vendor.updated")
        assert updated.before_values and updated.after_values


def test_used_vendor_cannot_be_deleted_but_can_be_deactivated(client):
    auth = headers(client, "finance.manager@payment.local")
    vendor = make_vendor(client, auth)
    with SessionLocal.begin() as db:
        owner = db.scalar(select(User).where(User.email == "requestor@payment.local"))
        department = db.scalar(select(Department).where(Department.code == "MKTG"))
        db.add(
            PaymentRequest(
                request_type="general",
                status="draft",
                requestor_id=owner.id,
                department_id=department.id,
                vendor_external_id=vendor["id"],
                payee_name=vendor["name"],
                purpose="Vendor reference",
                currency_code="PHP",
            )
        )
    path = f"/api/v1/vendors/{vendor['id']}"
    result = client.delete(path, headers=auth)
    assert result.status_code == 409 and "Deactivate" in result.text
    assert client.patch(path, headers=auth, json={"is_active": False}).json()["status"] == "inactive"
    assert client.delete("/api/v1/vendors/VEND-DEMO-001", headers=auth).status_code == 403
    client.cookies.clear()
    requester = headers(client, "requestor@payment.local")
    blocked = client.post(
        "/api/v1/requests",
        headers=requester,
        json={
            "request_type": "general",
            "department_id": str(department.id),
            "currency_code": "PHP",
            "vendor_external_id": vendor["id"],
            "payee_name": vendor["name"],
            "lines": [],
        },
    )
    assert blocked.status_code == 422 and "active vendor" in blocked.text


@pytest.mark.parametrize("role", ["requestor", "department.head", "coo", "president", "board.member"])
def test_read_only_roles_cannot_mutate_vendors(client, role):
    auth = headers(client)
    vendor = make_vendor(client, auth)
    client.cookies.clear()
    auth = headers(client, f"{role}@payment.local")
    path = f"/api/v1/vendors/{vendor['id']}"
    assert client.get(path).status_code == 200
    assert client.post("/api/v1/vendors", json={"name": "Forbidden"}, headers=auth).status_code == 403
    assert client.patch(path, json={"is_active": False}, headers=auth).status_code == 403
    assert client.delete(path, headers=auth).status_code == 403


def test_vendor_validation_duplicates_and_deleted_provider_override(client):
    auth = headers(client)
    vendor = make_vendor(client, auth)
    path = f"/api/v1/vendors/{vendor['id']}"
    for payload in [{"name": " "}, {"email": "invalid"}, {"website": "javascript:alert(1)"}, {"bankAccount": "hidden"}]:
        assert client.patch(path, json=payload, headers=auth).status_code == 422
    assert client.patch(path, json={"name": " sample   officeworks trading "}, headers=auth).status_code == 409
    assert client.post("/api/v1/vendors", json={"name": vendor["name"].upper()}, headers=auth).status_code == 409
    # A provider record with no P.O. or request references remains deleted across adapter reloads.
    assert client.delete("/api/v1/vendors/VEND-DEMO-002", headers=auth).status_code == 204
    assert client.get("/api/v1/vendors/VEND-DEMO-002").status_code == 404
    assert "VEND-DEMO-002" not in {row["id"] for row in client.get("/api/v1/vendors?active_only=false").json()}


@pytest.mark.parametrize("email", ["finance.associate@payment.local", "finance.manager@payment.local"])
def test_vendor_sources_ownership_and_general_payment_guard(client, email):
    auth = headers(client, email)
    provider = client.get("/api/v1/vendors/VEND-DEMO-001").json()
    assert provider["source"] == "procurement" and provider["is_sample"] is True
    assert client.patch("/api/v1/vendors/VEND-DEMO-001", headers=auth, json={"phone": "updated"}).status_code == 403
    assert client.delete("/api/v1/vendors/VEND-DEMO-001", headers=auth).status_code == 403
    # Same display name may exist in both sources without merging identities.
    created = client.post("/api/v1/vendors", headers=auth, json={"name": provider["name"]})
    assert created.status_code == 201, created.text
    own = created.json()
    assert own["source"] == "aps" and own["id"] != provider["id"] and own["is_sample"] is False
    client.cookies.clear()
    requester = headers(client, "requestor@payment.local")
    department = client.get("/api/v1/departments").json()[0]
    payload = {
        "request_type": "general",
        "department_id": department["id"],
        "currency_code": "PHP",
        "payee_name": provider["name"],
        "lines": [],
    }
    rejected = client.post(
        "/api/v1/requests", headers=requester, json={**payload, "vendor_external_id": provider["id"]}
    )
    assert rejected.status_code == 422 and "only through P.O." in rejected.text
    accepted = client.post("/api/v1/requests", headers=requester, json={**payload, "vendor_external_id": own["id"]})
    assert accepted.status_code == 201, accepted.text


def test_shared_vendor_database_is_authoritative_and_owner_is_immutable(client):
    from sqlalchemy import text
    from sqlalchemy.exc import IntegrityError

    identifier = f"VEND-PROC-{uuid4()}"
    name = f"Shared vendor {uuid4()}"
    with SessionLocal.begin() as db:
        db.add(
            VendorRecord(
                id=identifier,
                source_system="procurement",
                payload={
                    "id": "untrusted-json-id",
                    "name": name,
                    "email": "shared@example.test",
                    "informationStatus": "Information complete",
                    "source": "aps",
                    "version": 1,
                },
            )
        )
    auth = headers(client)
    result = client.get(f"/api/v1/vendors/{identifier}").json()
    assert result["id"] == identifier and result["source"] == "procurement"
    assert client.patch(f"/api/v1/vendors/{identifier}", headers=auth, json={"name": "Changed"}).status_code == 403
    assert client.delete(f"/api/v1/vendors/{identifier}", headers=auth).status_code == 403
    own = client.post("/api/v1/vendors", headers=auth, json={"name": name})
    assert own.status_code == 201 and own.json()["source"] == "aps"
    with SessionLocal.begin() as db:
        assert db.get(VendorRecord, own.json()["id"]).source_system == "aps"
        with pytest.raises(IntegrityError), db.begin_nested():
            db.add(VendorRecord(id=f"invalid-{uuid4()}", source_system="unknown", payload={"name": "Invalid"}))
            db.flush()
        with pytest.raises(IntegrityError), db.begin_nested():
            db.execute(text("UPDATE vendor_records SET source_system='aps' WHERE id=:id"), {"id": identifier})
        assert db.get(VendorRecord, identifier).source_system == "procurement"
    assert (
        client.post(
            "/api/v1/vendors", headers=auth, json={"name": "Spoof owner", "source_system": "procurement"}
        ).status_code
        == 422
    )
    assert (
        client.post("/api/v1/vendors", headers=auth, json={"name": "Spoof source", "source": "procurement"}).status_code
        == 422
    )


def test_sample_vendors_are_persisted_without_overwriting_existing_profiles(client):
    auth = headers(client)
    with SessionLocal() as db:
        assert db.get(VendorRecord, "VEND-DEMO-001").source_system == "procurement"
        assert db.get(VendorRecord, "VEND-DEMO-002").source_system == "aps"
    own = make_vendor(client, auth)
    changed = client.patch(
        f"/api/v1/vendors/{own['id']}", headers=auth, json={"phone": "09170001234", "version": own["version"]}
    )
    assert changed.status_code == 200
    seed()
    result = client.get(f"/api/v1/vendors/{own['id']}").json()
    assert result["phone"] == "09170001234" and result["source"] == "aps"
