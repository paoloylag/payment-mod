import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from payment_module import procurement_vendors as client

URL = "http://127.0.0.1:39021/api/integrations/aps/v1/vendors"
ENV = {"PROCUREMENT_VENDOR_API_URL": URL, "PROCUREMENT_VENDOR_READ_TOKEN": "test-only-service-token-123456789012345"}
ROW = {
    "id": "a",
    "name": "Demo Vendor",
    "email": "demo@example.test",
    "is_active": True,
    "bankAccount": "PRIVATE",
    "source": "aps",
    "address": "Demo address",
}


class VendorClientTests(unittest.TestCase):
    def test_disabled_and_invalid_configuration(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(client.configuration())
            self.assertEqual(client.vendors(), [])
        for url in [
            "http://192.168.1.1/vendors",
            "https://user:password@example.test/vendors",
            "https://example.test/vendors?token=private",
        ]:
            with (
                patch.dict(os.environ, {**ENV, "PROCUREMENT_VENDOR_API_URL": url}, clear=True),
                self.assertRaises(HTTPException),
            ):
                client.configuration()

    def test_safe_projection_and_source_namespace(self):
        row = client.project(ROW)
        self.assertEqual(row["source"], "procurement")
        self.assertEqual(row["id"], "procurement:a")
        self.assertEqual(row["street"], "Demo address")
        self.assertNotIn("bankAccount", row)
        with self.assertRaises(HTTPException):
            client.project({"name": "Broken"})

    def test_pagination_and_inactive_filter_request(self):
        with (
            patch.dict(os.environ, ENV),
            patch.object(
                client, "fetch", side_effect=[{"items": [ROW], "nextCursor": "a"}, {"items": [], "nextCursor": None}]
            ) as fetch,
        ):
            self.assertEqual(len(client.vendors(active_only=False)), 1)
            self.assertIn("activeOnly=false", fetch.call_args_list[0].args[0])

    def test_repeated_cursor_and_bad_response_fail_closed(self):
        for result in [{"items": [], "nextCursor": "a"}, {"items": "invalid"}]:
            with (
                patch.dict(os.environ, ENV),
                patch.object(client, "fetch", return_value=result),
                self.assertRaises(HTTPException),
            ):
                client.vendors()

    def test_outage_is_redacted(self):
        with (
            patch.object(client, "build_opener", side_effect=ValueError("secret-in-error")),
            self.assertRaises(HTTPException) as error,
        ):
            client.fetch(URL, ENV["PROCUREMENT_VENDOR_READ_TOKEN"])
        self.assertEqual(error.exception.status_code, 503)
        self.assertNotIn("secret", error.exception.detail)

    def test_unknown_vendor_is_none(self):
        with patch.dict(os.environ, ENV), patch.object(client, "fetch", return_value=None):
            self.assertIsNone(client.vendor("procurement:missing"))


class LocalVendorIsolationTests(unittest.TestCase):
    def test_local_vendor_lookup_does_not_call_provider(self):
        from types import SimpleNamespace

        from payment_module.vendor_adapter import SharedVendorAdapter

        row = SimpleNamespace(
            id="aps-local", source_system="aps", payload={"name": "APS Supplier", "email": "aps@example.test"}
        )
        db = SimpleNamespace(get=lambda model, key: row)
        with patch.object(client, "fetch", side_effect=AssertionError("Provider must not be called")):
            self.assertEqual(SharedVendorAdapter(db).get("aps-local")["source"], "aps")

    def test_remote_vendor_source_cannot_be_edited_as_local(self):
        from payment_module.vendor_adapter import SharedVendorAdapter

        with (
            patch.object(client, "configuration", return_value=(URL, "test-token")),
            patch.object(client, "vendor", return_value=client.project(ROW)),
        ):
            self.assertEqual(SharedVendorAdapter().get("procurement:a")["source"], "procurement")


if __name__ == "__main__":
    unittest.main()
