"""Opt-in SMTP adapter scaffold. Not called by the notification worker.

No automatic retries: SMTP acceptance can be ambiguous after a lost connection.
"""

import argparse
import hashlib
import json
import smtplib
import ssl
from dataclasses import dataclass
from datetime import UTC, datetime
from email.headerregistry import Address
from email.message import EmailMessage
from email.utils import format_datetime
from html import escape
from typing import Protocol
from urllib.parse import quote, urlsplit

from .config import Settings, get_settings
from .mention_email import mention_email


@dataclass(frozen=True)
class EmailEnvelope:
    recipient: str
    subject: str
    text_body: str
    html_body: str
    delivery_key: str


class EmailTransport(Protocol):
    def send(self, message: EmailMessage, *, sender: str, recipient: str) -> None: ...


class EmailTransportError(RuntimeError):
    """Safe error; provider responses, recipient addresses and secrets are not exposed."""


def _address(value):
    try:
        address = Address(addr_spec=value)
        if not address.username or not address.domain:
            raise ValueError("Missing domain")
        return address
    except (ValueError, TypeError) as error:
        raise ValueError("A single email address is required") from error


def prepare_email(event, recipient, *, app_url=None):
    """Render an approved snapshot; caller must recheck eligibility before live delivery."""
    plan = event.payload.get("notification")
    if not plan or str(recipient.id) not in plan.get("recipient_ids", []):
        raise ValueError("No approved email recipient snapshot")
    if not recipient.is_active or recipient.is_suspended:
        raise ValueError("Recipient is not active")
    _address(recipient.email)
    base = (app_url or get_settings().notification_app_url).rstrip("/")
    parsed = urlsplit(base)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Configure an HTTP(S) application URL without credentials, query or fragment")
    if plan.get("kind") == "conversation_mention":
        content = mention_email(event.payload, recipient, base)
    else:
        subject = " ".join(str(plan["title"]).splitlines())
        preview = str(plan["preview"])
        reference = event.payload.get("request_number")
        url = f"{base}/#/requests/{quote(str(reference), safe='')}" if reference else f"{base}/#/dashboard"
        content = {
            "subject": subject,
            "text_body": f"{subject}\n\n{preview}\n\nOpen request: {url}\nSign in to view this request.",
            "html_body": f"<h1>{escape(subject)}</h1><p>{escape(preview)}</p>"
            f'<p><a href="{escape(url, quote=True)}">View request</a></p>'
            "<p>Sign in to view this request.</p>",
        }
    return EmailEnvelope(
        recipient.email,
        content["subject"],
        content["text_body"],
        content["html_body"],
        f"{event.id}:{recipient.id}:{plan['version']}",
    )


class SmtpTransport:
    def __init__(self, settings: Settings):
        self.settings = settings

    def send(self, message, *, sender, recipient):
        settings = self.settings
        if not settings.email_delivery_enabled or settings.email_transport != "smtp":
            raise ValueError("SMTP delivery is disabled")
        context = ssl.create_default_context()
        try:
            if settings.smtp_security == "tls":
                connection = smtplib.SMTP_SSL(
                    settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds, context=context
                )
            else:
                connection = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds)
            with connection as client:
                client.ehlo()
                if settings.smtp_security == "starttls":
                    client.starttls(context=context)
                    client.ehlo()
                if settings.smtp_username:
                    client.login(settings.smtp_username, settings.smtp_password.get_secret_value())
                refused = client.send_message(message, from_addr=sender, to_addrs=[recipient])
                if refused:
                    raise EmailTransportError("Email recipient was refused; inspect delivery before retrying")
        except (smtplib.SMTPException, OSError):
            raise EmailTransportError("SMTP delivery failed; outcome may be unknown. Verify before retrying.") from None


def deliver_email(envelope: EmailEnvelope, *, settings=None, transport: EmailTransport | None = None):
    settings = settings or get_settings()
    if not settings.email_delivery_enabled:
        return "disabled"
    if settings.email_transport != "smtp":
        raise ValueError("Enabled email requires the SMTP transport")
    sender = _address(settings.email_from_address)
    recipient = _address(envelope.recipient)
    message = EmailMessage()
    message["From"] = Address(display_name=settings.email_from_name, addr_spec=sender.addr_spec)
    message["To"] = recipient
    message["Subject"] = envelope.subject
    message["Date"] = format_datetime(datetime.now(UTC))
    digest = hashlib.sha256(envelope.delivery_key.encode()).hexdigest()
    message["Message-ID"] = f"<{digest}@{sender.domain}>"
    message.set_content(envelope.text_body)
    message.add_alternative(envelope.html_body, subtype="html")
    (transport or SmtpTransport(settings)).send(message, sender=sender.addr_spec, recipient=recipient.addr_spec)
    return "accepted"  # SMTP acceptance is not inbox delivery or exactly-once delivery.


def main():
    parser = argparse.ArgumentParser(description="Validate email configuration locally; never connects or sends.")
    parser.add_argument("--check", action="store_true", required=True)
    parser.parse_args()
    settings = get_settings()
    print(
        json.dumps(
            {
                "enabled": settings.email_delivery_enabled,
                "transport": settings.email_transport,
                "security": settings.smtp_security,
                "worker_connected": False,
                "network_used": False,
            }
        )
    )


if __name__ == "__main__":
    main()
