# Phase 04 document API

All routes require an authenticated session, CSRF protection for mutations, document permission, and authorization to the owning payment request.

## Implemented routes

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/v1/requests/{request_id}/documents` | Upload a request- or line-level document using multipart field `file` and optional `line_id` and `document_type_id`. |
| `GET` | `/api/v1/requests/{request_id}/documents` | List authorized document metadata, duplicate-use warnings, and immutable version history. |
| `GET` | `/api/v1/documents/{document_id}/content` | Stream the current authorized version. PDF/images use inline disposition; Office files and `?download=true` use attachment disposition. |
| `POST` | `/api/v1/documents/{document_id}/versions` | Replace the current content by creating a new immutable version. |
| `DELETE` | `/api/v1/documents/{document_id}` | Soft-remove an editable document, retain its audit metadata, and attempt protected object cleanup. |
| `POST` | `/api/v1/documents/{document_id}/cleanup/retry` | Retry failed object cleanup for an authorized removed document. |
| `GET` | `/api/v1/requests/{request_id}/document-requirements` | Evaluate active request- and line-level document requirements. |
| `GET` | `/api/v1/document-requirement-rules` | List configured rules for an authorized Finance manager or administrator. |
| `POST` | `/api/v1/document-requirement-rules` | Create a configurable document rule. |
| `PATCH` | `/api/v1/document-requirement-rules/{rule_id}` | Update or deactivate a configurable document rule. |
| `POST` | `/api/v1/documents/{document_id}/hard-copy` | Append a Finance hard-copy status event. |
| `POST` | `/api/v1/documents/{document_id}/reviews` | Append an accepted, rejected, or replacement-required Finance decision. |

## Current rules

- Accepted extensions and matching declared MIME types: PDF, JPG/JPEG, PNG, XLSX, XLS, DOCX, and DOC.
- The file signature must match the declared format. Empty content, traversal filenames, unsupported MIME/extension pairs, and mismatched signatures return `422`.
- Maximum size is 50 MB per file and 100 MB across active document versions for one request. Historical versions do not count toward the active limit.
- Upload and replacement are allowed only to the owning requestor while the request is `draft` or `returned`.
- Document reads also require visibility of the owning request. Unknown and unauthorized records both return `404`.
- SHA-256 duplicate matches are non-blocking. Authorized matching request identifiers/numbers are included in `duplicate_uses` for Finance verification.
- The object key and bucket are never returned. Downloads use `nosniff`, private/no-store caching, and a safe UTF-8 content-disposition filename.
- Storage failure returns a safe `503` without exposing endpoint, bucket, key, credentials, or provider details.
- Removal is limited to the owning requestor while the request is `draft` or `returned`. Metadata, audit evidence, and cleanup state remain available after the object is removed.
- Configured active required-document rules are enforced during submission and resubmission. Request types without configured rules remain non-blocking until Finance approves their final requirements.
- Hard-copy and review changes are append-only histories. Waivers, rejections, and replacement-required decisions require an explanatory note.

## Deferred production integrations

Production AWS environment validation, malware-provider integration, and formal retention/lifecycle activation remain gated on the corresponding infrastructure and Finance decisions.
