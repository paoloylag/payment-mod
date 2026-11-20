import hashlib
import hmac
import unittest

from payment_module.procurement_wire import closure_headers


class ProcurementWireTests(unittest.TestCase):
    def test_matches_provider_hmac_over_exact_bytes(self):
        body = b'{"eventId":"test-only","type":"po.closed"}'
        secret = "local-test-secret-32-characters-only"
        headers = closure_headers(body, secret, timestamp=1794614400)
        expected = hmac.new(secret.encode(), b"1794614400." + body, hashlib.sha256).hexdigest()
        self.assertEqual(headers["X-APS-Signature"], expected)
        self.assertEqual(headers["X-APS-Timestamp"], "1794614400")

    def test_whitespace_and_retry_timestamp_affect_signature(self):
        secret = "local-test-secret-32-characters-only"
        a = closure_headers(b'{"eventId":"x"}', secret, timestamp=1794614400)
        b = closure_headers(b'{ "eventId":"x"}', secret, timestamp=1794614400)
        retry = closure_headers(b'{"eventId":"x"}', secret, timestamp=1794614401)
        self.assertNotEqual(a["X-APS-Signature"], b["X-APS-Signature"])
        self.assertNotEqual(a["X-APS-Signature"], retry["X-APS-Signature"])

    def test_rejects_unconfigured_or_invalid_inputs(self):
        for body, secret, stamp in [
            (b"{}", "", 1794614400),
            (b"", "x" * 32, 1794614400),
            (b"x" * 65537, "x" * 32, 1794614400),
            (b"{}", "x" * 32, True),
            (b"{}", "x" * 32, -1),
        ]:
            with self.subTest(stamp=stamp, length=len(body)):
                with self.assertRaises(ValueError):
                    closure_headers(body, secret, timestamp=stamp)
