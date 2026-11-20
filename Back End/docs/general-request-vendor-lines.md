# General Payment vendor inheritance — 12 November 2026

Select or add the vendor once in the General Payment Vendor section. All line Vendor fields are read-only and inherit that name, including newly added lines. Editing a new supplier name or changing the selected vendor updates line values and collapsed line titles. Empty selection clears inherited values. New suppliers show Pending Finance validation and remain request-bound until Finance acceptance; Reimbursement merchant fields remain independent.

The General Payment API normalizes line vendor names to the request vendor on draft creation and edits, rather than trusting differing client merchant names. Existing submitted records are not rewritten. Legacy General requests without the explicit supplier-option data retain their prior behavior.

Checks: build and 24 frontend tests passed; 50 supplier/request backend tests passed; final canonical-name supplier rerun passed 5 tests and Ruff. Browser checked new supplier save, inheritance on an added second line, read-only fields and supplier rename. Existing active APS selection is covered by the helper regression; no active vendor was available in the local requestor dropdown for a browser selection check. No new shared UI component was introduced.
