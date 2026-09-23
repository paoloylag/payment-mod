# Phase 04 — Documents

Date prepared: 2026-08-28  
Last updated: 2026-09-23
Status: In progress
Depends on: Phase 03 — Payment Requests

Current delivery slice: implement through the first four document API capabilities—upload, metadata listing, authorized download/preview, and immutable replacement/version history. Removal, required-document evaluation, Finance hard-copy mutation, and document-review APIs remain in the next Phase 04 slice.

## Objective

Provide a secure, versioned document service for request- and line-level supporting files.

## Confirmed initial product rules

- Allowed formats: PDF, JPG/JPEG, PNG, XLSX, XLS, DOCX, and DOC.
- Maximum size: 50 MB per file and 100 MB in aggregate per request. Only active document versions attached to the request count toward the aggregate limit; retained historical versions do not.
- Submitted-request documents are retained indefinitely for the initial implementation. Eligible draft files may be removed with audit evidence. A formal fixed retention period, archival tier, and legal-hold policy must be confirmed before production lifecycle rules are enabled.
- PDF and image files are previewable in the application. Office documents are download-only in the initial implementation.
- Finance tracks hard-copy state as `Not required`, `Pending`, or `Received`, including the actor and timestamp of each change.
- Duplicate content is accepted with a warning rather than blocked. The warning records the matching document checksum and linked request identifier/number so Finance can identify where the same file was already used. Requestors see linked-request details only when authorized to view that request; Finance users with the applicable request scope can review all matching links.
- After submission, a requestor may replace or remove a document only while the request is in a returned-for-correction state. Finance/reviewer status changes do not overwrite the stored file or document version history.

## Scope

- Private upload/download, metadata, checksums, MIME and size validation, versions, replacement, and permitted removal.
- Request-level and line-level links, required-document rules, and hard/soft-copy status.
- Private S3-compatible object storage in every backend environment; no file binaries in PostgreSQL or the application container.
- Authorization for requestors, department reviewers, Finance, and administrators.
- Malware-scanning adapter and quarantine states ready for production integration.

## Planned data model

- Document metadata with owner/request context, original and safe display names, media type, byte size, checksum, storage key, state, and timestamps.
- Immutable document versions linked to a stable logical document record.
- Request-level and line-level document links with document type and requirement context.
- Versioned document rules by request type, amount/policy conditions, and effective dates.
- Finance/reviewer decisions and hard-copy receipt state without altering stored file history.
- Hard-copy tracking history with `Not required`, `Pending`, and `Received` states, actor, timestamp, and optional Finance note.

## Storage and file-handling rules

- Use private AWS S3 buckets in deployed environments and an S3-compatible MinIO service in local Docker and automated integration tests.
- Store binaries only in object storage; PostgreSQL contains metadata, immutable version records, checksums, bucket aliases, and opaque object keys.
- Generate server-controlled, non-guessable object keys and never derive keys from submitted filenames. The original filename is display metadata only.
- Keep buckets private, block public access, disable object ACL usage, and expose files only through an authorized backend response or short-lived presigned URL.
- Use environment-specific buckets or strictly separated prefixes and credentials. Development and test credentials must never have access to staging or production objects.
- Require server-side encryption in deployed AWS environments. Use S3-managed encryption by default until an approved customer-managed KMS key and ownership process are supplied. Local MinIO may disable object encryption when no development KMS is configured; it contains synthetic development files only and remains loopback-bound.
- Enable S3 bucket versioning for deployed buckets. Application document versions remain the authoritative business history and reference an immutable object key/version identifier.
- Use explicit `pending/`, `available/`, `quarantine/`, and retained-history key namespaces or equivalent object tags without revealing them to clients.
- Stream uploads/downloads with configured limits instead of loading unbounded files into memory.
- Validate allowed size, declared type, detected type where supported, extension, checksum, and empty/corrupt content.
- Enforce both the 50 MB per-file limit and the 100 MB active-document aggregate per request before promoting an upload to available storage.
- Use the content checksum to find prior uses. A duplicate match creates non-blocking warning evidence and authorized links to the matching request/document records; it does not reuse or overwrite the prior object.
- Replacement creates a new version and never overwrites the prior binary or metadata.
- Removal is limited to eligible draft content and remains auditable. Object deletion occurs only after the database transaction commits and through a retryable cleanup job; transactionally required history is retained.
- Quarantined, scan-pending, rejected, missing, and available states are explicit.
- S3 lifecycle rules may transition or expire only objects that the application has marked eligible under the approved retention policy. Lifecycle rules must never independently delete active document history.

## Authorization and privacy

- Access requires both document permission and authorization to the owning request/line.
- Download identifiers are opaque; guessed IDs, storage keys, or filenames must not bypass request authorization.
- Responses use safe content-disposition filenames and defensive browser headers.
- Logs and errors exclude file contents, local paths, object-store credentials, and sensitive extracted metadata.
- Administrative recovery actions are permission-controlled and audited.

## Adapter boundary

- Define storage operations for multipart/streamed put, open/read, stat/head, checksum verification, short-lived download authorization, copy/promote, and protected delete/retention without coupling domain services directly to the AWS SDK.
- Implement the adapter against the S3 API. AWS S3 is the deployment target and MinIO provides the same contract in local Docker and tests.
- Prefer backend-mediated uploads for the initial implementation so authorization, checksum, MIME validation, and scan state remain server-controlled. Add direct presigned multipart upload only if later file-size or throughput requirements justify it.
- Define malware-scan submission/result interfaces with development-safe behavior and explicit production fail-open/fail-closed decision points.
- Keep real AWS credentials out of source control and inject them through environment/secret management. Use short-lived workload credentials or an instance/task role in deployed environments rather than static production access keys.
- Production upload enablement remains gated on bucket ownership, region, encryption, IAM policy, retention, CORS, monitoring, and staging validation. Malware scanning remains separately gated on its approved provider and failure policy.

## S3 configuration and operations

- Required configuration: endpoint override for local MinIO, region, bucket name, credential provider, server-side-encryption mode, presigned URL lifetime, multipart thresholds, and connection/read timeouts.
- The application startup/readiness path verifies configuration and bucket reachability without creating or exposing objects.
- IAM grants only the object operations required by the application for its assigned bucket/prefix; bucket administration remains outside the application role.
- S3 access logging or CloudTrail data events, storage metrics, failed-operation alerts, and correlation identifiers must support operational investigation without logging document contents or credentials.
- Database backup and restore covers metadata only. Object-storage recovery, replication, version retention, and reconciliation are documented and tested separately.
- A reconciliation command identifies database records with missing objects and unreferenced objects without deleting either automatically.

## Frontend implementation

- Connect document upload, progress, requirement checklist, preview/download, replacement, version history, and review state to APIs.
- Display safe errors for invalid type/size, interrupted upload, duplicate content, quarantine, missing storage object, and forbidden access.
- Make upload controls keyboard accessible and ensure progress/status information is announced appropriately.
- Preserve mock documents and predictable adapter behavior for frontend-only development.

## Delivery sequence

1. Confirm file limits, allowed formats, retention, preview, and required-document rules.
2. Add document metadata, version, link, rule, and review-state migrations/models.
3. Add MinIO to the local Docker stack, create the S3 adapter/configuration, and implement checksum, authorization, replacement, and download services.
4. Add upload, metadata, download, replacement, removal, and review APIs.
5. Connect upload, preview, requirements, and document-review frontend views.
6. Test traversal resistance, unauthorized access, version history, corruption, and missing-file recovery.

### Current slice boundary

Included now:

1. S3/MinIO storage configuration and adapter.
2. Reversible document and immutable-version database schema.
3. File type, MIME, size, checksum, aggregate-limit, duplicate-warning, authorization, and audit controls.
4. Upload, metadata list, authorized content/preview, and replacement/version-history APIs.

Deferred to the next slice:

- Draft document removal and storage cleanup workflow.
- Persisted required-document rule evaluation.
- Finance hard-copy status mutation and history APIs.
- Finance/reviewer document-decision APIs.
- Full frontend API wiring for the deferred operations.

## Acceptance gates

- Unauthorized users cannot enumerate, upload, preview, or download protected files.
- Replaced files retain immutable metadata and version history.
- Required-document checks operate on persisted metadata and request type rules.
- Storage paths and sensitive metadata never leak through errors or logs.
- The S3 adapter works against local MinIO and AWS S3 configuration without changing domain services.
- Buckets remain private, unauthorized presigning is impossible, and expired presigned URLs no longer grant access.
- Database metadata and object-storage contents can be reconciled after restart, backup/restore, and simulated missing-object failures.

## Test and validation matrix

- Migration and S3-adapter contract tests against MinIO.
- Authorized/unauthorized upload, metadata, preview, download, replacement, and removal.
- Filename traversal, absolute path, reserved name, Unicode, MIME mismatch, oversize, empty, corrupt, and duplicate-content cases.
- Checksum verification, multipart/stream behavior, version preservation, missing-object recovery, database/object-store rollback compensation, and reconciliation behavior.
- Required-document evaluation by request type and request/line context.
- Quarantine and malware-adapter success, failure, retry, and timeout simulations.
- Private-bucket, IAM-denial, presigned-expiry, wrong-bucket/environment, unavailable-S3, timeout, retry, and non-public-access tests.
- Browser upload/replace/download walkthrough, responsive/accessibility review, build, dependency audit, Docker/MinIO persistence, metadata backup/restore, object reconciliation, and CI.

## Expected evidence

- Adapter contract, storage layout description, rule examples, security-test output, version-history demonstration, browser results, QA register entries, reviewed release package, checksum, and CI run.

## Remaining decisions

These do not block local implementation against MinIO:

- Formal production retention duration, archival tier, legal-hold process, and approved S3 lifecycle rules. Initial behavior retains submitted-request documents indefinitely.
- AWS account/bucket owner, region, environment-specific bucket names, encryption choice, IAM/workload identity, monitoring owner, and approved presigned URL lifetime.
- Malware-scanning provider and production fail-open/fail-closed policy.

## Exclusions

Approval decisions and Finance document review outcomes are consumed in later phases. Phase 04 prepares AWS S3 support, but production uploads are not enabled until the environment-specific bucket, IAM, encryption, retention, monitoring, and staging gates are approved.
