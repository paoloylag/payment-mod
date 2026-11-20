# Procurement vendor read connection — 20 November 2026

## Implemented

APS can opt in to read vendor information from the Procurement service while retaining APS-owned vendors in PostgreSQL. No vendor rows are copied or synchronized. Procurement-owned vendors remain read-only and excluded from General Payment selection. This is an interim read interface, not the separately agreed shared vendor database migration and not a complete PO/payment integration.

Procurement routes (dedicated read service credential, not staff sessions):

- GET /api/integrations/aps/v1/vendors?q=&activeOnly=true&limit=50&cursor=
- GET /api/integrations/aps/v1/vendors/{provider-id}

The list returns items and nextCursor. Limit is 1–100, cursor is the preceding stable vendor ID, search matches name/email. Detail returns 404 when absent. Non-GET is rejected. Requests are bounded/rate limited; unconfigured service returns 503, invalid/missing credentials 401. No browser CORS or write/session protection was disabled.

Safe projection: provider ID, name, email, contact person, phone, address, TIN, categories, active state, record version/update time and latest Procurement enrollment status (or Not enrolled). Private banking data, invitation tokens, internal notes and file contents are excluded. Information completeness does not establish Procurement qualification; APS displays qualification separately. Documents remain in Procurement; this feature does not implement service document downloads.

## Configuration

Procurement environment: APS_VENDOR_READ_TOKEN (dedicated random secret, at least 32 characters; keep server-side).

APS environment:

- PROCUREMENT_VENDOR_API_URL=https://<procurement-host>/api/integrations/aps/v1/vendors
- PROCUREMENT_VENDOR_READ_TOKEN=<same dedicated secret>

HTTPS is required except literal loopback development endpoints. Do not use a shared staff account, supplier invitation token or the closure signing secret. Avoid URL credentials/query tokens. Rotate both sides together. Configure the API process environment before starting it; no configuration is exposed to the browser.

With both APS variables absent, existing local/shared-table behavior is unchanged. Partial/invalid configuration fails closed with 503. When enabled, local Procurement-labelled samples are replaced in the directory by provider results; local APS vendors remain. Provider failures return a generic 503 instead of silently falling back to sample data. Existing loaded rows may remain on screen alongside the refresh error; they are not freshly confirmed.

APS gives provider records a procurement: ID namespace and preserves provider_id. Before real PO adapter activation, map PO supplier IDs to this namespace or the eventual canonical shared ID; do not match by name. Historical mock PO/vendor IDs are not a real provider crosswalk. Existing immutable request/vendor snapshots must remain intact.

## Validation

| ID | Check | Result / evidence |
|---|---|---|
| T01 | Valid service access, list/search/paging/detail | Pass: Node HTTP tests and actual APS Python client -> real Procurement handler |
| T02 | Missing/wrong credentials, disabled service, write rejection | Pass: 401/503/405 checks in isolated in-memory provider |
| T03 | Safe fields, ownership and selection boundaries | Pass: private fields excluded; actual APS PATCH rejected with 403; browser shows read-only details and General Payment selector excludes provider vendors |
| T04 | Provider outage, malformed data, pagination loops, missing vendor and retry recovery | Pass: client tests; actual stopped fixture produced visible APS unavailable error; Refresh recovered after restart; missing API lookup returned 404 |
| T05 | Finance browser visibility | Pass: actual Finance Associate navigation -> Procurement vendors -> View; contact/address/TIN/qualification; desktop dark and 390px narrow detail inspected |

Automated results: Procurement endpoint/cross-language/operations run 12 passed; APS client/ownership unit checks 8 passed; existing frontend unit checks 24 passed. APS frontend build and targeted backend Ruff checks passed. Normal databases were not reset/seeded. No emails, payments, approval sends or closure events were triggered.

Browser preview is isolated: http://127.0.0.1:5178/ (API 58006), test database payment_module_test, distinct aps_vendor_test_session cookie. Provider 39021 uses an in-memory database with two clearly fictional suppliers. Normal APS at 5176/58002 remains unconfigured for remote vendors. Test runtime/credentials/logs are ignored under the workspace outputs folder, not source.

Preview processes started: provider PID 13676, APS API PID 20840, frontend PID 15852. Stop only these helpers with Stop-Process -Id 13676,20840,15852 when finished; do not stop normal APS. The fixture loses its vendors on shutdown. Temporary test token is not a deployment credential.

## Repeat checks

Procurement: node --test server/aps-vendors.test.mjs server/operations.test.mjs.

The cross-language case requires APS_VENDOR_TEST_PYTHON pointing to a Python executable with APS dependencies, and PYTHONPATH including the APS api folder. Without it, that one case is explicitly skipped. APS unit command: python tests/test_procurement_vendor_client_unit.py. Existing isolated backend pytest conventions also apply.

Procurement disposable browser fixture: node server/aps-vendor-preview.mjs with an ephemeral APS_VENDOR_READ_TOKEN; loopback port 39021 only. Never seed a real supplier into this fixture or use a production secret.

## Remaining

1. Deploy both changed codebases and configure the real Procurement URL/service secret; this change is not committed/pushed or activated against real data yet.
2. Complete canonical PostgreSQL vendor repository/ID crosswalk integration as previously agreed. This interface does not supersede it.
3. Add scoped supplier document metadata/content access if APS needs to view Procurement supporting documents.
4. Finish real PO read adapter, PO/vendor-ID correlation and payment eligibility checks.
5. Complete APS approval/financial receiver/display and separate settlement/closure policy work in Procurement.
6. Run real environment acceptance and service credential rotation/monitoring. No full PO/payment end-to-end completion is claimed.
