# Phase 05 prototype-policy trial

Date: 2026-09-29  
Policy version: `prototype-2026-09-29-r3`  
Status: Provisional route preview, not an approved production approval policy.

## Matrix being trialed

Every PHP request previews Department Head approval and Finance Associate document validation first. The Finance Manager then performs budget review, or final approval when the table names that role.

| Request | PHP amount | Last approval stage |
|---|---:|---|
| Cash Advance | Up to 40,000 | Finance Manager; above 40,000 is blocked by the existing submission limit. |
| Budgeted, other types | Up to 100,000 | Finance Manager |
| Budgeted, other types | 100,000.01 through 300,000 | COO |
| Budgeted, other types | Above 300,000 | President |
| Unbudgeted, other types | Up to 1,000,000 | COO |
| Unbudgeted, other types | Above 1,000,000 | COO → President → Board Member |

The threshold tiers follow the prototype. On 2026-09-29, the owner confirmed that an unbudgeted PHP request above 1,000,000 goes to COO, then President, then Board review. Foreign-currency requests remain intentionally unroutable until Finance defines the threshold basis.

## Implemented and checked

- `workflow_policy.route_for` uses fixed-precision `Decimal` comparisons and returns ordered, immutable stage descriptions with the policy version.
- `GET /api/v1/workflow/preview/{request_id}` requires an authenticated user with visibility of the request; unauthorized records remain hidden.
- The focused policy tests cover the 40,000, 100,000, 300,000 and 1,000,000 boundaries, all five request types, the confirmed COO → President → Board sequence, non-positive amounts, pending foreign-currency policy, and API visibility. For version `r3`, **16 tests passed, 2 warnings** on 2026-09-29 in the isolated test schema. Ruff, Python compilation, and `git diff --check` also passed. The complete backend regression last passed **91 tests, 2 warnings** before this route adjustment and was not repeated for this focused change.
- The seed-repeatability test was corrected to allow other valid settings while verifying that a second seed adds no settings and restores the seeded values and document-rule definitions.
- Ruff, Python compilation, and `git diff --check` passed for this slice.
- The frontend production build could not be verified in this checkout: Windows returned `EPERM` while opening Vite's installed `vite.js` under `node_modules`. No frontend source was changed in this slice.

## Findings to review before activating decisions

1. The prototype applies numeric thresholds to USD/EUR/custom amounts without a PHP conversion rule. The backend preview returns a clear error for non-PHP requests until Finance approves whether thresholds use request currency or a snapshotted PHP equivalent and specifies the rate source.
2. Return, decline, and resubmission behavior within the confirmed COO → President → Board sequence still needs a Phase 05 transition rule; the route order itself is confirmed.
3. Confirm whether Finance Manager budget review is a required approval on every route, and whether Finance Associate document validation belongs in the Phase 05 approval engine or Phase 06 validation service.
4. Define delegation, reassignment, return destination, required comments, and escalation before those commands can be enabled.

## Next development slice

Persist policy snapshots, ordered assignments, decisions, workflow events, and idempotency records when a request is submitted. Add role/department-scoped queues and approve/return/decline APIs with concurrency and audit tests, then connect the persona views. Do not treat the read-only preview as an active approval workflow.
