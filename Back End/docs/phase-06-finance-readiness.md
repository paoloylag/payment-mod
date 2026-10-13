# Phase 06 — Finance configuration readiness checklist

Prepared: 2026-10-13
Status: Live readiness report implemented; policy activation pending Finance rule confirmation

## Saved configuration draft

Administration → Request Settings → Finance Setup Draft now saves partial Finance choices with a version and audit event. Finance Managers and System Administrators can edit; Finance Associates can view. Options cover VAT/EWT bases, rounding, rule dates, tax and debit/credit account defaults by request type, voucher numbering and certification, voucher authority, and the proposed sign-off scope. Only active tax codes and active posting accounts can be selected.

The draft reports missing choices. Even a fully filled draft is not activated: detailed vendor/line applicability, department-specific mappings, sign-off records, calculation snapshots, and the creation/submission gate still require implementation and Finance confirmation. The scope selector records the intended scope; it does not yet create separate department configurations.

The owner confirmed that Finance must finish the required setup before an affected request can be created or submitted. Tax and account settings should then apply automatically; Finance Associate reviews the resulting classification and coding later. A missing applicable rule must be shown as a configuration blocker, never treated as a zero tax rate or an uncoded line.

The Finance Setup response now includes a live `readiness` report, displayed below its form. It checks current effective tax/account references, distinct debit/credit accounts, effective department cost centers, missing choices, and certification wording. `ready` and `enforced` remain false while policy activation is pending. A completed draft is not represented as an active setup. Request creation/editing and submission enforce active departments, effective posting accounts, and effective cost centers belonging to the request department; the submission check catches master data changed after a draft was saved.

## Checks that can be enforced from the current data model

| Area | Proposed readiness check | Current behavior |
|---|---|---|
| Department and currency | The request department exists; its currency is active. A foreign currency needs a configured conversion to be selectable in the request UI, except the confirmed Finance Manager per-request rate path. | Creation validates department/currency; request currency selection and Finance Manager rate handling exist. |
| Cost center | An active, effective cost center exists for the department when the request type requires cost-center coding. | Required line IDs are checked at submission for Reimbursement, Liquidation, P.O. Payment, and General requests. A department-wide readiness check is not implemented. |
| Expense account | At least one active, effective posting account is available when the request type requires expense coding. | Required line IDs are checked at submission for those same types. A system-wide readiness check is not implemented. |
| Document rules | Each required document rule is configured for the request type and required uploads are present. | Current active rules and uploads are checked at submission; Finance Associate must accept every current required document before approval. |
| Finance request policies | Cash Advance cap, liquidation deadline, reimbursement age handling, and one-outstanding setting have valid saved values. | Settings have defaults and validation, but there is no explicit Finance sign-off state. |

## Rules Finance must supply before the full creation/submission gate

1. **Tax applicability:** Which request types, vendor classes, line types, and dates require VAT, EWT, or explicit No EWT; which tax code applies to each combination; and which requests are exempt. An active tax code alone cannot prove that an applicable rule exists.
2. **Account mapping:** The default debit and credit account for each supported transaction and tax outcome; how department/cost center affects the mapping; and who may correct a mapping after automatic application.
3. **Effective dates and versions:** When new tax/account settings become effective, whether drafts use the current version at creation or submission, and how a returned request is recalculated.
4. **Voucher controls:** Numbering scope and reset rule, mandatory payment method fields, certification wording, and create/post/void authority.
5. **Readiness scope:** Whether Finance signs off once for the whole tenant or separately by request type, department, and effective date. The gate must name every missing item and the Finance screen where it can be fixed.

## Implementation order

1. Add an authenticated readiness report that returns each check, status, applicable request types, and a plain-language missing-setting message. Finance sees the full checklist; requestors see only actionable blockers.
2. Enforce the confirmed master-data and document checks at creation and submission without silently substituting defaults. Keep existing per-line validation and the Finance Associate review gate.
3. After Finance confirms the tax/account matrix, add versioned applicability and mapping records; apply them automatically and persist the selected rule, rates, accounts, inputs, and results in a request snapshot.
4. Add exact calculation fixtures and tests for every approved example, including No EWT, rounding boundaries, and the PHP 200,000 TOJUST case. Then enable the tax/account readiness gate and voucher workbench.

Until the applicability and mapping matrix is approved, a generic “at least one tax code exists” check is insufficient to declare Finance configuration ready.
