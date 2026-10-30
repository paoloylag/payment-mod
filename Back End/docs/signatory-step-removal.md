# Finance payment release without signatory approval

Signatory approval is no longer a workflow gate. Finance Associate prepares payment instructions without assigning a signatory, then records release evidence and releases bank-transfer/cash payments. Checks still require Ready for pickup before release. Finance Manager clearing, exception/recovery controls, request approvals, voucher issuance, versions and idempotency checks remain in force.

Migration 20261030_0031 makes signatory assignment nullable. Historical assignments and approval events remain unchanged. Previously prepared and authorized payment lines can both proceed through Finance release. Authorization endpoints reject new authorization commands; their queue is empty. Prepared-payment notifications go to Finance.

Apply the migration before serving the updated backend. A downgrade cannot make the column required while unassigned payment instructions exist; do not fabricate assignments or delete payment history.

Focused regression: tests/test_no_signatory.py covers preparation without assignment, retired authorization, evidence required before release, and bank transfer/cash/check paths. Legacy tests that explicitly expect a signatory gate describe the retired workflow and require revision before using them as release gates.
