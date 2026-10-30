"""HTML and plain-text email for an explicit conversation tag. No mail transport."""
from html import escape
from urllib.parse import quote, urlsplit
from .config import get_settings

VERSION = "conversation-mention-v1"


def mention_email(payload, recipient, app_url=None):
    base = (app_url or get_settings().notification_app_url).rstrip("/")
    parsed = urlsplit(base)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Notification app URL must be an HTTP(S) application URL")
    reference = payload["request_number"]
    author = payload["author_name"]
    body = payload["message_body"]
    action_url = f"{base}/#/requests/{quote(reference, safe='')}/conversation/{quote(payload['message_id'], safe='')}"
    subject = " ".join(f"[Payment Module] {author} tagged you in {reference}".split())
    text = (f"Hi {recipient.display_name},\n\n{author} tagged you in the conversation for request {reference}.\n\n"
            f"Message:\n{body}\n\nView conversation: {action_url}\n\n"
            "Sign in with your Payment Module account to view or reply. Reply in the system; this email does not accept replies.")
    message_html = escape(body).replace("\n", "<br>")
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{escape(subject)}</title></head>
<body style="margin:0;background:#f7f4ef;color:#17191f;font-family:Arial,sans-serif;font-size:14px;line-height:1.6">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #dedede;border-radius:12px">
<tr><td style="padding:20px 24px;background:#9e1d20;color:#fff;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold">Payment Module</td></tr>
<tr><td style="padding:24px;overflow-wrap:anywhere;word-break:break-word"><h1 style="margin:0 0 20px;font-size:22px;color:#9e1d20">You were tagged in a conversation</h1>
<p>Hi {escape(recipient.display_name)},</p><p><strong>{escape(author)}</strong> tagged you in the conversation for request <strong>{escape(reference)}</strong>.</p>
<div style="margin:20px 0;padding:16px;background:#faf8f5;border-left:3px solid #9e1d20;overflow-wrap:anywhere;word-break:break-word">{message_html}</div>
<p style="margin:24px 0"><a href="{escape(action_url, quote=True)}" style="display:inline-block;padding:12px 20px;background:#9e1d20;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">View Conversation</a></p>
<p style="color:#646b78;font-size:12px">Sign in with your Payment Module account to view or reply. Reply in the system; this email does not accept replies.</p>
<p style="font-size:12px;overflow-wrap:anywhere">If the button does not work, open:<br><a href="{escape(action_url, quote=True)}">{escape(action_url)}</a></p>
</td></tr></table></td></tr></table></body></html>"""
    return {"subject": subject, "text_body": text, "html_body": html, "action_url": action_url}
