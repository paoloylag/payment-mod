from uuid import uuid4

import pytest
from cryptography.fernet import Fernet
from payment_module.bank_crypto import decrypt_account_number, encrypt_account_number
from payment_module.config import get_settings
from payment_module.database import SessionLocal
from payment_module.models import AuditEvent, CostCenter, Currency, Department, PaymentMethod, User
from payment_module.seed import DEPARTMENTS, seed
from payment_module.vendor_adapter import SAMPLE_VENDOR_PAYLOAD, safe_vendor
from sqlalchemy import func, select

PASSWORD = "Phase01-Test-Only!"


def login(client, email="admin@payment.local"):
    return client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})


def test_phase_02_seed_catalog_is_deterministic() -> None:
    seed()
    seed()
    with SessionLocal() as db:
        departments = list(db.scalars(select(Department).where(Department.code.in_(DEPARTMENTS))))
        centers = list(db.scalars(select(CostCenter).where(CostCenter.code.in_(DEPARTMENTS))))
        assert {(item.code, item.name) for item in departments} == set(DEPARTMENTS.items())
        assert {(item.code, item.name) for item in centers} == set(DEPARTMENTS.items())
        assert len({item.department_id for item in centers}) == 8
        assert set(db.scalars(select(Currency.code))) >= {"PHP", "USD", "EUR"}
        assert set(db.scalars(select(PaymentMethod.code))) >= {"CHECK", "BANK_TRANSFER", "CASH"}


def test_department_creation_atomically_creates_and_synchronizes_cost_center(client) -> None:
    seed()
    suffix = uuid4().hex[:6].upper()
    initial_code = f"L{suffix}"
    updated_code = f"U{suffix}"
    initial_name = f"Legal {suffix}"
    updated_name = f"Legal Services {suffix}"
    session = login(client)
    headers = {"X-CSRF-Token": session.json()["csrf_token"]}
    created = client.post("/api/v1/departments", json={"code": initial_code, "name": initial_name}, headers=headers)
    assert created.status_code == 201
    with SessionLocal() as db:
        department = db.scalar(select(Department).where(Department.code == initial_code))
        center = db.scalar(select(CostCenter).where(CostCenter.department_id == department.id))
        assert (center.code, center.name, center.is_active) == (department.code, department.name, True)
    updated = client.patch(
        f"/api/v1/departments/{department.id}",
        json={"code": updated_code, "name": updated_name, "is_active": False},
        headers=headers,
    )
    assert updated.status_code == 200
    with SessionLocal() as db:
        center = db.scalar(select(CostCenter).where(CostCenter.department_id == department.id))
        assert (center.code, center.name, center.is_active) == (updated_code, updated_name, False)
        assert db.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.entity_id == department.id)) >= 1


def test_master_data_crud_permissions_and_vendor_masking(client) -> None:
    seed()
    requestor = login(client, "requestor@payment.local")
    assert requestor.status_code == 200
    assert client.get("/api/v1/currencies").status_code == 200
    assert (
        client.post(
            "/api/v1/tax-codes",
            json={
                "code": "TESTVAT",
                "name": "Test VAT",
                "vat_classification": "test",
                "vat_rate": 12,
                "ewt_classification": "test",
                "ewt_rate": 2,
            },
            headers={"X-CSRF-Token": requestor.json()["csrf_token"]},
        ).status_code
        == 403
    )

    client.cookies.clear()
    admin = login(client)
    headers = {"X-CSRF-Token": admin.json()["csrf_token"]}
    created = client.post(
        "/api/v1/tax-codes",
        json={
            "code": "TESTVAT",
            "name": "Test VAT",
            "vat_classification": "subject",
            "vat_rate": 12,
            "ewt_classification": "services",
            "ewt_rate": 2,
        },
        headers=headers,
    )
    assert created.status_code in {201, 409}
    vendors = client.get("/api/v1/vendors").json()
    assert vendors[0]["name"] == "Power Mac Center, Inc."
    assert "bankAccountNumber" not in vendors[0]
    assert vendors[0]["maskedBankAccountNumber"] is None


def test_bank_encryption_and_finance_manager_can_deny_admin_sensitive_access(client) -> None:
    settings = get_settings()
    original_key = settings.bank_encryption_key
    settings.bank_encryption_key = Fernet.generate_key().decode()
    try:
        token = encrypt_account_number("000123456789")
        assert "000123456789" not in token
        assert decrypt_account_number(token) == "000123456789"
    finally:
        settings.bank_encryption_key = original_key

    seed()
    manager = login(client, "finance.manager@payment.local")
    with SessionLocal() as db:
        admin = db.scalar(select(User).where(User.email == "admin@payment.local"))
    changed = client.put(
        "/api/v1/bank-access",
        json={"user_id": str(admin.id), "allowed": False, "reason": "Finance access review"},
        headers={"X-CSRF-Token": manager.json()["csrf_token"]},
    )
    assert changed.status_code == 200
    client.cookies.clear()
    login(client)
    assert client.get("/api/v1/company-bank-accounts").status_code == 200
    assert (
        client.post(
            "/api/v1/company-bank-accounts",
            json={
                "code": "OPERATING",
                "bank_name": "Example Bank",
                "account_name": "Life College",
                "account_number": "000123456789",
                "currency_code": "PHP",
            },
            headers={"X-CSRF-Token": login(client).json()["csrf_token"]},
        ).status_code
        == 403
    )


def test_vendor_normalizer_never_exposes_clear_account_number() -> None:
    payload = {**SAMPLE_VENDOR_PAYLOAD, "bankAccountNumber": "SYNTHETIC-TEST-6789"}
    item = safe_vendor(payload)
    assert item["maskedBankAccountNumber"] == "•••• 6789"
    assert "bankAccountNumber" not in item
    assert "SYNTHETIC-TEST-6789" not in str(item)


def test_master_data_lists_are_bounded_searchable_and_stably_ordered(client) -> None:
    seed()
    assert login(client).status_code == 200
    first = client.get("/api/v1/cost-centers?page=1&page_size=3")
    second = client.get("/api/v1/cost-centers?page=2&page_size=3")
    assert first.status_code == second.status_code == 200
    assert len(first.json()) == len(second.json()) == 3
    assert first.headers["X-Total-Count"] == second.headers["X-Total-Count"]
    assert first.headers["X-Page"] == "1"
    assert second.headers["X-Page"] == "2"
    assert {item["id"] for item in first.json()}.isdisjoint(item["id"] for item in second.json())
    assert [item["name"] for item in first.json() + second.json()] == sorted(
        item["name"] for item in first.json() + second.json()
    )
    match = client.get("/api/v1/cost-centers?search=OCP&active=true")
    assert match.status_code == 200
    assert [item["code"] for item in match.json()] == ["OCP"]
    assert client.get("/api/v1/cost-centers?page_size=101").status_code == 422
    assert client.get("/api/v1/currencies?page=1&page_size=2").headers["X-Page-Size"] == "2"
    assert client.get("/api/v1/vendors?page=2&page_size=1").json() == []
    assert client.get("/api/v1/company-bank-accounts?page=1&page_size=1").headers["X-Page-Size"] == "1"


def test_chart_account_duplicate_cycle_and_referenced_delete_are_rejected(client) -> None:
    seed()
    session = login(client)
    headers = {"X-CSRF-Token": session.json()["csrf_token"]}
    suffix = uuid4().hex[:8].upper()
    parent_payload = {
        "code": f"A{suffix}",
        "name": f"Test Parent {suffix}",
        "account_type": "expense",
        "normal_balance": "debit",
    }
    parent = client.post("/api/v1/chart-of-accounts", json=parent_payload, headers=headers)
    assert parent.status_code == 201, parent.text
    parent_id = parent.json()["id"]
    child_id = None
    try:
        assert client.post("/api/v1/chart-of-accounts", json=parent_payload, headers=headers).status_code == 409
        child = client.post(
            "/api/v1/chart-of-accounts",
            json={**parent_payload, "code": f"B{suffix}", "name": f"Test Child {suffix}", "parent_id": parent_id},
            headers=headers,
        )
        assert child.status_code == 201, child.text
        child_id = child.json()["id"]
        assert (
            client.patch(
                f"/api/v1/chart-of-accounts/{parent_id}", json={"parent_id": child_id}, headers=headers
            ).status_code
            == 422
        )
        assert client.delete(f"/api/v1/chart-of-accounts/{parent_id}", headers=headers).status_code == 409
        assert (
            client.patch(
                f"/api/v1/chart-of-accounts/{child_id}", json={"is_active": False}, headers=headers
            ).status_code
            == 200
        )
        inactive = client.get("/api/v1/chart-of-accounts?active=false&search=" + suffix).json()
        assert [item["id"] for item in inactive] == [child_id]
    finally:
        if child_id:
            assert client.delete(f"/api/v1/chart-of-accounts/{child_id}", headers=headers).status_code == 204
        assert client.delete(f"/api/v1/chart-of-accounts/{parent_id}", headers=headers).status_code == 204


def test_vendor_mock_search_and_wrong_bank_key_fail_safely(client) -> None:
    seed()
    assert login(client).status_code == 200
    assert [item["name"] for item in client.get("/api/v1/vendors?search=power%20mac").json()] == [
        "Power Mac Center, Inc."
    ]
    assert client.get("/api/v1/vendors?search=not-a-vendor").json() == []
    assert client.get("/api/v1/vendors/unknown-vendor").status_code == 404
    settings = get_settings()
    original_key = settings.bank_encryption_key
    settings.bank_encryption_key = Fernet.generate_key().decode()
    try:
        token = encrypt_account_number("SYNTHETIC-TEST-6789")
        settings.bank_encryption_key = Fernet.generate_key().decode()
        with pytest.raises(RuntimeError, match="Unable to decrypt"):
            decrypt_account_number(token)
    finally:
        settings.bank_encryption_key = original_key
