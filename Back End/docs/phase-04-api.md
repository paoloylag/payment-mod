# Phase 04 document API — first delivery slice

All routes require an authenticated session, CSRF protection for mutations, document permission, and authorization to the owning payment request.

## Implemented routes

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/api/v1/requests/{request_id}/documents` | Upload a request- or line-level document using multipart field `file` and optional `line_id`. |
| `GET` | `/api/v1/requests/{request_id}/documents` | List authorized document metadata, duplicate-use warnings, and immutable version history. |
| `GET` | `/api/v1/documents/{document_id}/content` | Stream the current authorized version. PDF/images use inline disposition; Office files and `?download=true` use attachment disposition. |
| `POST` | `/api/v1/documents/{document_id}/versions` | Replace the current content by creating a new immutable version. |

## Current rules

- Accepted extensions and matching declared MIME types: PDF, JPG/JPEG, PNG, XLSX, XLS, DOCX, and DOC.
- The file signature must match the declared format. Empty content, traversal filenames, unsupported MIME/extension pairs, and mismatched signatures return `422`.
- Maximum size is 50 MB per file and 100 MB across active document versions for one request. Historical versions do not count toward the active limit.
- Upload and replacement are allowed only to the owning requestor while the request is `draft` or `returned`.
- Document reads also require visibility of the owning request. Unknown and unauthorized records both return `404`.
- SHA-256 duplicate matches are non-blocking. Authorized matching request identifiers/numbers are included in `duplicate_uses` for Finance verification.
- The object key and bucket are never returned. Downloads use `nosniff`, private/no-store caching, and a safe UTF-8 content-disposition filename.
- Storage failure returns a safe `503` without exposing endpoint, bucket, key, credentials, or provider details.

## Deferred within Phase 04

Draft removal, required-document evaluation, Finance hard-copy tracking mutations, reviewer decisions, malware-provider integration, and their frontend workflows are planned for the next slice.
