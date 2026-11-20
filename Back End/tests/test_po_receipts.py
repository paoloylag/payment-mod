import hashlib
import hmac
import json
import time
from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from payment_module.config import get_settings
from payment_module.database import SessionLocal
from payment_module.po_receipts import receipt_gate, require_po_receipt
from pydantic import SecretStr

SECRET = "receipt-test-only-secret-12345678901234567890"


def confirmation():
    return {
        "eventId": str(uuid4()),
        "type": "po.receipt_confirmed",
        "schemaVersion": 1,
        "occurredAt": datetime.now(UTC).isoformat(),
        "poId": str(uuid4()),
        "poNumber": "PO-TEST-001",
        "poVersion": 8,
        "sourceRequestId": "PR-source",
        "requesterId": "original",
        "confirmedById": "original",
        "confirmedByName": "Sample Requestor",
        "confirmedAt": datetime.now(UTC).isoformat(),
        "fullyReceived": True,
        "receiptIds": ["receipt-1"],
        "invoiceDocumentIds": ["invoice-1"],
        "items": [{"itemId": "item-1", "ordered": 2, "accepted": 2, "rejected": 0}],
    }


def send(client, data, secret=SECRET, stamp=None):
    body = json.dumps(data).encode()
    stamp = stamp or str(int(time.time()))
    return client.post(
        "/api/v1/integrations/procurement/receipts",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Procurement-Timestamp": stamp,
            "X-Procurement-Signature": hmac.new(
                secret.encode(), stamp.encode() + b"." + body, hashlib.sha256
            ).hexdigest(),
        },
    )


def source(body):
    return SimpleNamespace(
        request_type="poPayment",
        type_data={
            "procurement_snapshot": {
                "purchase_order": {
                    "id": body["poId"],
                    "poNumber": body["poNumber"],
                    "version": 2,
                    "sourceRequestId": body["sourceRequestId"],
                    "requesterId": body["requesterId"],
                    "items": [{"id": "item-1", "quantity": 2}],
                }
            }
        },
    )


def test_signed_receipt_unlocks_release_not_workflow_and_deduplicates(
    client, monkeypatch
):
    monkeypatch.setattr(get_settings(), "procurement_receipt_secret", SecretStr(SECRET))
    body = confirmation()
    item = source(body)
    with SessionLocal() as db:
        assert receipt_gate(db, item)["confirmed"] is False
        with pytest.raises(HTTPException) as blocked:
            require_po_receipt(db, item)
        assert blocked.value.status_code == 409
    assert send(client, body).status_code == 200
    assert send(client, body).json()["duplicate"] is True
    assert send(client, {**body, "confirmedByName": "Changed"}).status_code == 409
    assert send(client, {**body, "eventId": str(uuid4())}).status_code == 409
    with SessionLocal() as db:
        assert receipt_gate(db, item)["confirmed"] is True
        require_po_receipt(db, item)
        item.type_data["procurement_snapshot"]["purchase_order"]["requesterId"] = (
            "wrong-owner"
        )
        assert receipt_gate(db, item)["confirmed"] is False
    assert (
        send(client, {**body, "eventId": str(uuid4()), "poVersion": 7}).status_code
        == 409
    )


@pytest.mark.parametrize(
    "mutation",
    [
        {"confirmedById": "receiving-staff"},
        {"fullyReceived": False},
        {"invoiceDocumentIds": []},
        {"receiptIds": []},
        {"items": [{"itemId": "item-1", "ordered": 2, "accepted": 1, "rejected": 0}]},
    ],
)
def test_wrong_human_partial_receipt_and_missing_evidence_rejected(
    client, monkeypatch, mutation
):
    monkeypatch.setattr(get_settings(), "procurement_receipt_secret", SecretStr(SECRET))
    assert send(client, {**confirmation(), **mutation}).status_code == 422


def test_receipt_service_authentication_and_snapshot_fail_closed(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "procurement_receipt_secret", None)
    assert send(client, confirmation()).status_code == 503
    monkeypatch.setattr(get_settings(), "procurement_receipt_secret", SecretStr(SECRET))
    assert send(client, confirmation(), secret="bad").status_code == 401
    assert send(client, confirmation(), stamp="1").status_code == 401
    assert send(client, confirmation(), stamp="9" * 5000).status_code == 401
    with SessionLocal() as db:
        assert not receipt_gate(
            db, SimpleNamespace(request_type="poPayment", type_data={})
        )["confirmed"]
        assert receipt_gate(db, SimpleNamespace(request_type="general"))["confirmed"]


def test_receipt_requires_current_matching_ordered_quantities(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "procurement_receipt_secret", SecretStr(SECRET))
    body = confirmation()
    assert send(client, body).status_code == 200
    item = source(body)
    with SessionLocal() as db:
        item.type_data["procurement_snapshot"]["purchase_order"]["items"][0][
            "quantity"
        ] = 3
        assert not receipt_gate(db, item)["confirmed"]
        item.type_data["procurement_snapshot"]["purchase_order"]["items"][0][
            "quantity"
        ] = 2
        item.type_data["procurement_snapshot"]["purchase_order"]["version"] = 9
        assert not receipt_gate(db, item)["confirmed"]


def test_replaced_rejections_do_not_block_fully_accepted_goods(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "procurement_receipt_secret", SecretStr(SECRET))
    body = confirmation()
    body["items"][0]["rejected"] = 1
    assert send(client, body).status_code == 200
    with SessionLocal() as db:
        assert receipt_gate(db, source(body))["confirmed"]


def test_receipt_audit_history_cannot_be_updated(client, monkeypatch):
    from payment_module.po_receipts import ProcurementReceiptEvent
    from sqlalchemy import update
    from sqlalchemy.exc import DBAPIError

    monkeypatch.setattr(get_settings(), "procurement_receipt_secret", SecretStr(SECRET))
    body = confirmation()
    assert send(client, body).status_code == 200
    with pytest.raises(DBAPIError):
        with SessionLocal.begin() as db:
            db.execute(
                update(ProcurementReceiptEvent)
                .where(ProcurementReceiptEvent.event_id == body["eventId"])
                .values(body_hash="0" * 64)
            )


def test_concurrent_delivery_records_one_receipt_event(client, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor

    from payment_module.po_receipts import ProcurementReceiptEvent
    from sqlalchemy import func, select

    monkeypatch.setattr(get_settings(), "procurement_receipt_secret", SecretStr(SECRET))
    body = confirmation()
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: send(client, body), range(2)))
    assert [response.status_code for response in responses] == [200, 200]
    assert sorted(response.json()["duplicate"] for response in responses) == [
        False,
        True,
    ]
    with SessionLocal() as db:
        assert (
            db.scalar(
                select(func.count())
                .select_from(ProcurementReceiptEvent)
                .where(ProcurementReceiptEvent.event_id == body["eventId"])
            )
            == 1
        )
