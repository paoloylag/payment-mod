from unittest.mock import patch

import pytest
from payment_module.config import Settings
from payment_module.procurement_adapter import get_procurement_adapter
from payment_module.vendor_adapter import get_vendor_adapter
from pydantic import ValidationError


def deployment(**overrides):
    return Settings(_env_file=None, **{
        "app_env": "production", "development_demo_password": None,
        "session_cookie_secure": True, "trusted_hosts": "payment.life.edu.ph",
        "cors_origins": "https://payment.life.edu.ph",
        "database_url": "postgresql+psycopg://app:secret@database.example.invalid/payments?sslmode=verify-full",
        "s3_endpoint_url": None, "s3_access_key_id": None, "s3_secret_access_key": None,
        "s3_bucket": "private-documents", "s3_server_side_encryption": "AES256", **overrides,
    })


@pytest.mark.parametrize("changes", [
    {"session_cookie_secure": False}, {"development_demo_password": "demo"},
    {"trusted_hosts": "*"}, {"trusted_hosts": "localhost"},
    {"cors_origins": "http://payment.life.edu.ph"},
    {"cors_origins": "https://payment.life.edu.ph/path"},
    {"database_url": "postgresql+psycopg://app:secret@db/payments"},
    {"s3_endpoint_url": "http://minio:9000"}, {"s3_access_key_id": "static-key"},
    {"s3_server_side_encryption": ""},
])
def test_deployed_settings_reject_unsafe_defaults(changes):
    with pytest.raises(ValidationError):
        deployment(**changes)


def test_deployment_excludes_sample_vendors_and_purchase_orders():
    settings = deployment()
    with patch("payment_module.config.get_settings", return_value=settings):
        assert get_vendor_adapter().list(active_only=False) == []
        assert get_procurement_adapter().list(eligible_only=False) == []


def test_deployment_hides_docs_and_enforces_host_header():
    from payment_module.main import create_app
    from starlette.testclient import TestClient

    with patch("payment_module.main.settings", deployment()):
        with TestClient(create_app(), base_url="https://payment.life.edu.ph") as deployed:
            assert deployed.get("/healthz").status_code == 200
            assert deployed.get("/docs").status_code == 404
            assert deployed.get("/api/v1/openapi.json").status_code == 404
            assert deployed.get("/healthz", headers={"Host": "attacker.example"}).status_code == 400
