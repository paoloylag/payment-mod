import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
API_ROOT = PROJECT_ROOT / "api"
sys.path.insert(0, str(API_ROOT))

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DATABASE_TIMEZONE", "Asia/Manila")

from payment_module.main import app  # noqa: E402


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client
