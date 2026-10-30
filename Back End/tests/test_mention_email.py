from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4
import pytest
from sqlalchemy import select, func
from payment_module.database import SessionLocal
from payment_module.models import NotificationDelivery, NotificationOutboxEvent, User
from payment_module.mention_email import mention_email
from payment_module.seed import seed
from test_request_conversation import submitted_request, login
from test_notifications_phase08 import process_pending


def test_tag_email_escapes_content_and_links_to_conversation():
    payload = {"request_number": "GEN-2026-920001", "message_id": str(uuid4()),
        "author_name": "Mara <Reyes>\r\nInjected", "message_body": '@Nina <img src=x onerror=alert(1)>\nPlease review & reply.'}
    result = mention_email(payload, SimpleNamespace(display_name="Nina & Santos"), "https://payment.life.edu.ph")
    assert "\r" not in result["subject"] and "\n" not in result["subject"]
    assert "<img" not in result["html_body"] and "&lt;img" in result["html_body"]
    assert "Nina &amp; Santos" in result["html_body"]
    assert payload["message_body"] in result["text_body"]
    assert result["action_url"].endswith(f"/#/requests/GEN-2026-920001/conversation/{payload['message_id']}")
    assert "View Conversation" in result["html_body"]
    with pytest.raises(ValueError):
        mention_email(payload, SimpleNamespace(display_name="Test"), "javascript:alert(1)")


def test_tags_prepare_one_private_email_and_preserve_single_in_app_notification(client):
    seed()
    request_id = submitted_request()
    headers = login(client, "department.head@payment.local")
    with SessionLocal() as db:
        owner = db.scalar(select(User).where(User.email == "requestor@payment.local"))
        owner_id, owner_name = str(owner.id), owner.display_name
    payload = {"body": f"@{owner_name} Please clarify the invoice date.", "mention_user_ids": [owner_id]}
    url = f"/api/v1/requests/{request_id}/conversation"
    posted = client.post(url, json=payload, headers={**headers, "Idempotency-Key": "mention-email-test"})
    assert posted.status_code == 201, posted.text
    assert client.post(url, json=payload, headers={**headers, "Idempotency-Key": "mention-email-test"}).json() == posted.json()
    process_pending()
    with SessionLocal.begin() as db:
        event = db.scalar(select(NotificationOutboxEvent).where(NotificationOutboxEvent.source_key == f"mention:{posted.json()['id']}"))
        entries = list(db.scalars(select(NotificationDelivery).where(NotificationDelivery.outbox_id == event.id)))
        assert len(entries) == 1 and entries[0].channel == "development_email"
        assert entries[0].content["subject"].startswith("[Payment Module]")
        assert payload["body"] in entries[0].content["text_body"]
        event.state, event.available_at = "pending", datetime.now(UTC)
        event_id = event.id
    process_pending()
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(NotificationDelivery).where(NotificationDelivery.outbox_id == event_id)) == 1
    assert not any(posted.json()["id"] in row.get("action_url", "") for row in client.get("/api/v1/notifications/email-previews").json()["items"])
    login(client, "requestor@payment.local")
    inbox = client.get("/api/v1/notifications").json()
    assert sum(item["message_id"] == posted.json()["id"] for item in inbox["items"]) == 1
    previews = client.get("/api/v1/notifications/email-previews").json()["items"]
    assert len(previews) == 1
    assert posted.json()["id"] in previews[0]["action_url"]
    assert "Please clarify the invoice date." in previews[0]["text_body"]
    client.cookies.clear()
    assert client.get("/api/v1/notifications/email-previews").status_code == 401


def test_untagged_messages_do_not_prepare_emails(client):
    seed()
    request_id = submitted_request()
    headers = login(client, "department.head@payment.local")
    response = client.post(f"/api/v1/requests/{request_id}/conversation", json={"body": "General note with no tag"}, headers={**headers, "Idempotency-Key": str(uuid4())})
    assert response.status_code == 201
    with SessionLocal() as db:
        assert db.scalar(select(NotificationOutboxEvent).where(NotificationOutboxEvent.source_key == f"mention:{response.json()['id']}")) is None
