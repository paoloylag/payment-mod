# Phase 04 — Documents

Date prepared: 2026-08-28  
Status: Not started  
Depends on: Phase 03 — Payment Requests

## Objective

Provide a secure, versioned document service for request- and line-level supporting files.

## Scope

- Private upload/download, metadata, checksums, MIME and size validation, versions, replacement, and permitted removal.
- Request-level and line-level links, required-document rules, and hard/soft-copy status.
- Protected local development storage behind a replaceable storage adapter; no file binaries in PostgreSQL.
- Authorization for requestors, department reviewers, Finance, and administrators.
- Malware-scanning adapter and quarantine states ready for production integration.

## Planned data model

- Document metadata with owner/request context, original and safe display names, media type, byte size, checksum, storage key, state, and timestamps.
- Immutable document versions linked to a stable logical document record.
- Request-level and line-level document links with document type and requirement context.
- Versioned document rules by request type, amount/policy conditions, and effective dates.
- Finance/reviewer decisions and hard-copy receipt state without altering stored file history.

## Storage and file-handling rules

- Store binaries outside PostgreSQL; the database contains metadata and opaque storage keys only.
- Generate server-controlled storage keys and never derive filesystem paths directly from submitted names.
- Stream uploads/downloads with configured limits instead of loading unbounded files into memory.
- Validate allowed size, declared type, detected type where supported, extension, checksum, and empty/corrupt content.
- Replacement creates a new version and never overwrites the prior binary or metadata.
- Removal is limited to eligible draft content and remains auditable; transactionally required history is retained.
- Quarantined, scan-pending, rejected, missing, and available states are explicit.

## Authorization and privacy

- Access requires both document permission and authorization to the owning request/line.
- Download identifiers are opaque; guessed IDs, storage keys, or filenames must not bypass request authorization.
- Responses use safe content-disposition filenames and defensive browser headers.
- Logs and errors exclude file contents, local paths, object-store credentials, and sensitive extracted metadata.
- Administrative recovery actions are permission-controlled and audited.

## Adapter boundary

- Define storage operations for put, open/read, stat, and protected delete/retention without coupling domain services to local disk or a specific cloud provider.
- Define malware-scan submission/result interfaces with development-safe behavior and explicit production fail-open/fail-closed decision points.
- Keep production object storage and malware scanning disabled until credentials, ownership, and staging validation are approved.

## Frontend implementation

- Connect document upload, progress, requirement checklist, preview/download, replacement, version history, and review state to APIs.
- Display safe errors for invalid type/size, interrupted upload, duplicate content, quarantine, missing storage object, and forbidden access.
- Make upload controls keyboard accessible and ensure progress/status information is announced appropriately.
- Preserve mock documents and predictable adapter behavior for frontend-only development.

## Delivery sequence

1. Confirm file limits, allowed formats, retention, preview, and required-document rules.
2. Add document metadata, version, link, rule, and review-state migrations/models.
3. Implement storage, checksum, authorization, replacement, and download services.
4. Add upload, metadata, download, replacement, removal, and review APIs.
5. Connect upload, preview, requirements, and document-review frontend views.
6. Test traversal resistance, unauthorized access, version history, corruption, and missing-file recovery.

## Acceptance gates

- Unauthorized users cannot enumerate, upload, preview, or download protected files.
- Replaced files retain immutable metadata and version history.
- Required-document checks operate on persisted metadata and request type rules.
- Storage paths and sensitive metadata never leak through errors or logs.
- Local storage works in Docker and can be replaced without changing domain services.

## Test and validation matrix

- Migration and storage-adapter contract tests.
- Authorized/unauthorized upload, metadata, preview, download, replacement, and removal.
- Filename traversal, absolute path, reserved name, Unicode, MIME mismatch, oversize, empty, corrupt, and duplicate-content cases.
- Checksum verification, version preservation, missing-object recovery, and database/storage rollback behavior.
- Required-document evaluation by request type and request/line context.
- Quarantine and malware-adapter success, failure, retry, and timeout simulations.
- Browser upload/replace/download walkthrough, responsive/accessibility review, build, dependency audit, Docker persistence, backup/restore metadata, and CI.

## Expected evidence

- Adapter contract, storage layout description, rule examples, security-test output, version-history demonstration, browser results, QA register entries, reviewed release package, checksum, and CI run.

## Decisions required before implementation

- Allowed file types and per-file/request limits.
- Retention and legal-hold expectations.
- Previewable formats and hard-copy tracking rules.
- Production storage and malware-scanning providers.

## Exclusions

Approval decisions and Finance document review outcomes are consumed in later phases; production storage is not enabled here.
