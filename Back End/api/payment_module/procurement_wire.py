"""Procurement wire signing helper; performs no HTTP calls or authorization.

Caller must supply an immutable server-derived outbox body. Closure events require
settlement, invoice, receipt and closure-authority checks; approval events require
completed approval. Never accept an arbitrary browser payload.
"""
import hashlib
import hmac
import time


def closure_headers(body: bytes, secret: str, *, timestamp: int | None = None) -> dict[str, str]:
    """Sign exact persisted UTF-8 JSON bytes, matching Procurement orders.aps.

    Retry the identical body/event ID with a fresh timestamp/signature. Rebuilding
    JSON may change its digest and cause a provider idempotency conflict.
    """
    if not isinstance(body, bytes) or not body or len(body) > 65536:
        raise ValueError("Closure body must contain 1 to 65536 bytes")
    if not isinstance(secret, str) or len(secret) < 32:
        raise ValueError("Procurement closure secret must have at least 32 characters")
    stamp = int(time.time()) if timestamp is None else timestamp
    if isinstance(stamp, bool) or not isinstance(stamp, int) or len(str(stamp)) != 10:
        raise ValueError("Timestamp must be a ten-digit Unix second integer")
    value = str(stamp)
    signature = hmac.new(secret.encode("utf-8"), value.encode("ascii") + b"." + body, hashlib.sha256).hexdigest()
    return {"Content-Type": "application/json", "X-APS-Timestamp": value, "X-APS-Signature": signature}
