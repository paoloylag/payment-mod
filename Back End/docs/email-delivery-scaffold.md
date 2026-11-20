# Email delivery scaffold

Prepared: 11 November 2026 (Asia/Manila). Status: adapter/configuration scaffold only; no real email enabled or sent.

## Available now

- api/payment_module/email_delivery.py defines a transport protocol, immutable email envelope, approved-recipient-snapshot rendering and an opt-in SMTP adapter.
- Conversation tags reuse the existing escaped HTML/text mention template. Other notification snapshots get a basic escaped HTML/text status email. A request-number snapshot links directly to the request; older snapshots without it link to Dashboard rather than a broken UUID route.
- Settings and .env.example/deploy/deployment.env.example cover the sender, SMTP host/port, STARTTLS or TLS, optional paired credentials and a bounded timeout. Plaintext SMTP is unsupported; certificate validation uses the standard verified SSL context. Deployed email requires HTTPS application links.
- Delivery defaults to disabled. The adapter builds multipart messages and a stable Message-ID per delivery key. Passwords use SecretStr and are not printed by the check command. SMTP failure messages do not expose provider responses or recipient/credential values.
- The adapter reports accepted only after SMTP acceptance. It does not claim inbox delivery, exactly-once delivery or provider deduplication. Lost responses can leave acceptance uncertain, so no automatic send retries are implemented.

## Check configuration without sending

From Back End with Python dependencies installed:

```powershell
$env:PYTHONPATH = "api"
python -m payment_module.email_delivery --check
```

This validates settings and prints only enablement, transport/security mode, worker connection status and whether a network was used. It never opens an SMTP connection. Leave EMAIL_DELIVERY_ENABLED=false and EMAIL_TRANSPORT=disabled for ordinary local work. Do not put real credentials in tracked files or chat; use runtime environment/secrets configuration when provisioning the provider.

Even setting EMAIL_DELIVERY_ENABLED=true does not connect the existing notification worker to SMTP. Calling the adapter directly with enabled settings can send; no HTTP send endpoint or test-send command was added.

## Queue boundary deliberately retained

The current notification worker remains database-only. Existing in-app notifications, development previews, transactional outbox handling and retry behavior are unchanged. Old pending/delivered events are not replayed or converted to email jobs. No new database table or migration is needed for this scaffold.

Before wiring live delivery:

1. Confirm the provider, sender/domain identity, host/port/security/authentication, application URL and intended recipients. Validate sender-domain authentication with the provider.
2. Add a separate durable per-recipient email job/attempt lifecycle and activation cutoff. Do not send SMTP from inside the existing outbox database transaction: external acceptance cannot roll back with the database.
3. Recheck active users and current request/conversation access at dispatch. Snapshot membership alone is not proof of current access; the rendering function does not replace those authorization checks.
4. Define retryable/permanent/uncertain outcomes, manual recovery, bounce/complaint handling, retention and provider monitoring. A stable Message-ID is not a substitute for durable state or reconciliation.
5. Exercise a controlled recipient allowlist/test mailbox with explicit authorization, then approve live activation. No historical backfill should occur implicitly.

## Test matrix

| ID / unit | Expected check / method | Result / evidence | Fix status |
| --- | --- | --- | --- |
| T01 Disabled delivery | Fake transport must never be called with default settings | Pass: test_disabled_adapter_never_calls_transport | No fix needed |
| T02 Configuration | Reject missing/invalid sender, host, insecure mode, invalid port, partial credentials, header injection and deployed HTTP links; network-free CLI | Pass: configuration cases and --check output | No fix needed |
| T03 Templates | Escape user text, require recipient snapshot/active account, reuse mention template, create working fallback link | Pass: rendering and mention adapter tests | No fix needed |
| T04 SMTP contract | Fake SMTP verifies TLS-before-auth, HTML/text MIME, sender/recipient, stable ID, safe error and no automatic retry | Pass: two TLS variants and failure/header tests | No fix needed |
| T05 Existing worker | Preserve in-app/development delivery, deduplication, recipients and deployment settings; SMTP remains disconnected | Pass: worker guard plus existing notification/mention/deployment regressions | No fix needed |

Five units passed; zero failed or blocked. These units are distinct from the 37 passing automated backend test cases (two existing warnings). Evidence: outputs/email-scaffold-tests.log. Ruff checks and git diff whitespace checks passed. Real SMTP/provider delivery is not run; frontend/browser and physical-device tests are not applicable because no UI changed. Tests use the isolated payment_module_test database and fake SMTP connections, not the local demo database or real recipients.
