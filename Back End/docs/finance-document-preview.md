# Finance document uploads and previews

The Finance Associate can select a document type and attach multiple files to an individual line during Finance validation, or while responding to a request for information. Selected files use removable tags before upload. Uploaded files are pending review and must be accepted before approval.

The API checks request visibility, workflow role, request state, and line ownership before writing the object. Uploads retain the existing size/type validation and audit record.

PDF and image links open an accessible modal. The viewer fetches the authenticated `/api/v1/documents/{id}/content` endpoint, which reads the stored object key and version through the S3 adapter. Bucket credentials and object URLs stay on the server. Browser blob URLs are released when the modal closes. Other formats offer a download; failed loads offer retry. The same adapter supports the local MinIO bucket and configured AWS S3 buckets.

Configure storage using the existing `S3_ENDPOINT_URL` (local/compatible storage), `S3_REGION`, `S3_BUCKET`, credentials or the deployment's AWS credential chain, and `S3_SERVER_SIDE_ENCRYPTION`. No public bucket or browser-facing S3 CORS rule is needed for API-proxied previews. AWS deployment connectivity has not been exercised by the local preview checks.

## Local sample documents

Run `python -m payment_module.seed_validation_documents` in the API environment, or `docker compose exec app python -m payment_module.seed_validation_documents` for the container preview. The command only runs with `APP_ENV=local`, targets development-seeded requests currently awaiting Finance Associate validation, and uses deterministic document IDs to avoid duplicates. It does not reset requests or approve their documents. The included PDF is clearly marked as a test file and not evidence of payment.
