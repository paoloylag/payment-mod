# Upload error feedback — 12 November 2026

UI engineer review was requested and completed read-only. The review identified missing filename/context, absent picker filters, disappearing errors and misleading whole-draft failure wording after partial save.

Implemented: request/line picker format hints; early rejection of unsupported extensions, explicit MIME mismatch and empty files; field-level accessible error retained through rendering; server filename and actionable format/content/size messages; attachment failure distinguished from saved request details; pending failed file retained for remove/replace; automatic retries suppressed until file changes or an explicit save. No server allowlist, signature check or size limit was relaxed. Missing browser MIME is deferred to server validation. All selected files in a rejected batch are left out together, preserving the previous selection.

Verified: 22 frontend unit tests; build; Ruff; 6 isolated document tests. Added filename/format assertions and content/mime/empty-file rejection coverage. Actual browser checks: unsupported text file rejected with filename/formats; renamed PDF content rejected on save with Attachment not saved and request-details-saved feedback; failed attachment replaced with valid-signature PDF and draft successfully saved. Fictional local QA data only. Fresh phone/tablet/dark visual checks, oversize uploads and mixed-batch UI behavior were not exercised in this pass.

Reusable findings extend the existing recoverable async lifecycle entry in boilerplate-ui-gaps.md; underlying upload/error controls already exist in the tenant boilerplate.
