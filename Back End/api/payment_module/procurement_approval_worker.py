"""Opt-in PO approval/financial delivery; disabled without receiver and secret."""

import json
import os
from datetime import UTC, datetime, timedelta
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .procurement_wire import closure_headers


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def send_approval(url, secret, body):
    target = urlsplit(url)
    if target.username or target.password or target.fragment or target.query:
        raise ValueError("Invalid integration endpoint")
    if target.scheme != "https" and not (
        target.scheme == "http" and target.hostname in {"localhost", "127.0.0.1", "::1"}
    ):
        raise ValueError("HTTPS required outside loopback")
    if not target.hostname or target.path.rstrip("/").endswith("/closure"):
        raise ValueError("Approval events require a dedicated approval receiver, never the closure endpoint")
    raw = body.encode("utf-8")
    request = Request(url, data=raw, headers=closure_headers(raw, secret), method="POST")
    with build_opener(NoRedirect()).open(request, timeout=10) as response:
        if response.status != 200:
            raise ValueError("Unexpected acknowledgement status")
        raw_response = response.read(65537)
        if len(raw_response) > 65536:
            raise ValueError("Acknowledgement too large")
        ack = json.loads(raw_response)
        if not isinstance(ack, dict) or ack.get("ok") is not True or ack.get("eventId") != json.loads(body)["eventId"]:
            raise ValueError("Invalid acknowledgement")


def deliver_event(event, sender, now):
    """Mutation is committed by the worker, not in the approval request."""
    event.attempts += 1
    try:
        sender(event.body)
    except Exception:
        event.last_error_code = "delivery_failed"  # Do not persist response bodies, secrets or URLs.
        event.state = "failed" if event.attempts >= 8 else "retry"
        event.available_at = now + timedelta(seconds=min(3600, 30 * 2 ** (event.attempts - 1)))
        return False
    event.state = "delivered"
    event.delivered_at = now
    event.last_error_code = None
    return True


def run_batch():
    url = os.environ.get("PROCUREMENT_APPROVAL_WEBHOOK_URL", "")
    secret = os.environ.get("PROCUREMENT_APPROVAL_WEBHOOK_SECRET", "")
    if not url or len(secret) < 32:
        return {"state": "not_configured", "delivered": 0}
    from sqlalchemy import select

    from .database import SessionLocal
    from .models import ProcurementApprovalEvent

    count = 0
    for _ in range(5):
        with SessionLocal() as db:
            now = datetime.now(UTC)
            event = db.scalar(
                select(ProcurementApprovalEvent)
                .where(
                    ProcurementApprovalEvent.state.in_(["pending", "retry"]),
                    ProcurementApprovalEvent.available_at <= now,
                )
                .order_by(ProcurementApprovalEvent.sequence)
                .with_for_update(skip_locked=True)
                .limit(1)
            )
            if event is None:
                break
            count += deliver_event(event, lambda body: send_approval(url, secret, body), now)
            db.commit()
    return {"state": "configured", "delivered": count}


if __name__ == "__main__":
    print(json.dumps(run_batch()))
