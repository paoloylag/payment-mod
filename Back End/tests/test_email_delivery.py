from types import SimpleNamespace
from uuid import uuid4

import pytest
from payment_module.config import Settings
from payment_module.email_delivery import (
    EmailEnvelope,
    EmailTransportError,
    deliver_email,
    prepare_email,
)
from pydantic import ValidationError


def settings(**changes):
    return Settings(_env_file=None, app_env="test", **changes)


def enabled(**changes):
    return settings(
        email_delivery_enabled=True,
        email_transport="smtp",
        smtp_host="smtp.example.test",
        email_from_address="payments@example.test",
        **changes,
    )


def envelope(**changes):
    return EmailEnvelope(
        **(
            {
                "recipient": "reviewer@example.test",
                "subject": "Review needed",
                "text_body": "Text",
                "html_body": "<p>Text</p>",
                "delivery_key": "event:user:v1",
            }
            | changes
        )
    )


def test_disabled_adapter_never_calls_transport():
    class Forbidden:
        def send(self, *args, **kwargs):
            pytest.fail("Disabled email contacted transport")

    assert deliver_email(envelope(), settings=settings(), transport=Forbidden()) == "disabled"


@pytest.mark.parametrize(
    "changes",
    [
        {"email_transport": "disabled"},
        {"smtp_host": ""},
        {"email_from_address": "not-an-address"},
        {"email_from_address": "sender@example.test\r\nBcc: leak@example.test"},
        {"smtp_username": "account"},
        {"smtp_port": 0},
        {"smtp_security": "none"},
        {"email_from_name": "Payment\nBcc: bad"},
    ],
)
def test_invalid_email_configuration_is_rejected(changes):
    values = {
        "email_delivery_enabled": True,
        "email_transport": "smtp",
        "smtp_host": "smtp.example.test",
        "email_from_address": "payments@example.test",
    } | changes
    with pytest.raises(ValidationError):
        settings(**values)


def test_rendering_checks_snapshot_and_escapes_user_content():
    user = SimpleNamespace(
        id=uuid4(), email="recipient@example.test", display_name="A & B", is_active=True, is_suspended=False
    )
    event = SimpleNamespace(
        id=uuid4(),
        aggregate_id=uuid4(),
        payload={
            "request_number": "GEN-2026-1",
            "notification": {
                "version": "v1",
                "recipient_ids": [str(user.id)],
                "title": "Review\nneeded",
                "preview": "<script>alert(1)</script>",
            },
        },
    )
    result = prepare_email(event, user, app_url="https://payment.example.test")
    assert result.subject == "Review needed"
    assert "<script>" not in result.html_body and "&lt;script&gt;" in result.html_body
    assert "/#/requests/GEN-2026-1" in result.text_body
    del event.payload["request_number"]
    assert "/#/dashboard" in prepare_email(event, user, app_url="https://payment.example.test").text_body
    user.is_suspended = True
    with pytest.raises(ValueError, match="not active"):
        prepare_email(event, user)
    user.is_suspended = False
    event.payload["notification"]["recipient_ids"] = []
    with pytest.raises(ValueError, match="snapshot"):
        prepare_email(event, user)


def test_mention_adapter_reuses_existing_template():
    user = SimpleNamespace(
        id=uuid4(), email="recipient@example.test", display_name="Reviewer", is_active=True, is_suspended=False
    )
    event = SimpleNamespace(
        id=uuid4(),
        aggregate_id=uuid4(),
        payload={
            "request_number": "GEN-2026-1",
            "message_id": str(uuid4()),
            "author_name": "Author",
            "message_body": "Please review",
            "notification": {"kind": "conversation_mention", "version": "v1", "recipient_ids": [str(user.id)]},
        },
    )
    result = prepare_email(event, user, app_url="https://payment.example.test")
    assert "/conversation/" in result.text_body
    assert "View Conversation" in result.html_body
    with pytest.raises(ValueError):
        prepare_email(event, user, app_url="https://user:password@example.test")


@pytest.mark.parametrize("security", ["starttls", "tls"])
def test_smtp_acceptance_uses_verified_tls_and_stable_message_id(monkeypatch, security):
    calls, messages = [], []

    class FakeSMTP:
        def __init__(self, host, port, **kwargs):
            assert host == "smtp.example.test"
            assert kwargs["timeout"] == 15
            if security == "tls":
                assert kwargs["context"].check_hostname
            calls.append("connect")

        def __enter__(self):
            return self

        def __exit__(self, *args):
            calls.append("close")

        def ehlo(self):
            calls.append("ehlo")

        def starttls(self, *, context):
            assert context.check_hostname
            calls.append("starttls")

        def login(self, username, password):
            assert (username, password) == ("account", "secret-value")
            calls.append("login")

        def send_message(self, message, **kwargs):
            assert kwargs == {"from_addr": "payments@example.test", "to_addrs": ["reviewer@example.test"]}
            assert message.is_multipart()
            assert message.get_body(preferencelist=("html",)) is not None
            messages.append(message)
            calls.append("send")
            return {}

    monkeypatch.setattr("payment_module.email_delivery.smtplib.SMTP", FakeSMTP)
    monkeypatch.setattr("payment_module.email_delivery.smtplib.SMTP_SSL", FakeSMTP)
    config = enabled(smtp_security=security, smtp_username="account", smtp_password="secret-value")
    for _ in range(2):
        assert deliver_email(envelope(), settings=config) == "accepted"
    assert messages[0]["Message-ID"] == messages[1]["Message-ID"]
    assert "secret-value" not in repr(config)
    assert calls.index("login") < calls.index("send")
    if security == "starttls":
        assert calls.index("starttls") < calls.index("login")
    else:
        assert "starttls" not in calls


def test_provider_failure_does_not_leak_secrets_or_retry(monkeypatch):
    class Broken:
        calls = 0

        def __init__(self, *args, **kwargs):
            Broken.calls += 1
            raise OSError("secret-value recipient@example.test")

    monkeypatch.setattr("payment_module.email_delivery.smtplib.SMTP", Broken)
    with pytest.raises(EmailTransportError, match="outcome may be unknown") as error:
        deliver_email(envelope(), settings=enabled())
    assert "secret-value" not in str(error.value)
    assert "recipient@" not in str(error.value)
    assert Broken.calls == 1


def test_header_injection_is_rejected_before_transport():
    with pytest.raises(ValueError):
        deliver_email(envelope(subject="Review\r\nBcc: other@example.test"), settings=enabled())


def test_notification_worker_is_not_connected_to_smtp(monkeypatch):
    from payment_module import notification_worker
    from payment_module.seed import seed
    from test_workflow_approvals import create_submitted

    seed()
    create_submitted()
    monkeypatch.setattr(notification_worker, "get_settings", enabled)

    def forbidden(*args, **kwargs):
        pytest.fail("The existing worker must not call SMTP")

    monkeypatch.setattr("payment_module.email_delivery.SmtpTransport.send", forbidden)
    result = notification_worker.run_batch(development_mailbox=True)
    assert result["processed"] > 0
    assert result["failed"] == 0


def test_deployed_email_rejects_http_application_links():
    from test_deployment_config import deployment

    with pytest.raises(ValidationError, match="HTTPS application URL"):
        deployment(
            email_delivery_enabled=True,
            email_transport="smtp",
            smtp_host="smtp.example.test",
            email_from_address="payments@example.test",
            notification_app_url="http://payment.example.test",
        )
