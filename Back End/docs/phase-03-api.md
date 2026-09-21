# Phase 03 Payment Request API

Base path: `/api/v1/requests`

All endpoints require an authenticated local session. Mutating endpoints also require `X-CSRF-Token`. Submission and
resubmission require an `Idempotency-Key` header. Responses include `X-Request-ID` for support correlation.

## List requests

`GET /api/v1/requests`

Visibility is enforced before filtering: requestors see their own records, Department Heads see their department and
direct reports, and authorized Finance/System Administrator users see all records. Supported query parameters:

| Parameter | Behavior |
|---|---|
| `page` | One-based page number; default `1` |
| `page_size` | Records per page; default and maximum `100` |
| `search` | Case-insensitive request number, payee, or purpose search |
| `request_type` | Exact request type code |
| `status` | Exact lifecycle status |
| `department` | Department UUID, code, or exact display name |
| `date_from`, `date_to` | Inclusive ISO dates using submitted date, otherwise updated date |
| `min_amount`, `max_amount` | Inclusive request-total bounds; minimum cannot exceed maximum |
| `sort_by` | `submitted`, `updated`, `voucher`, `type`, `status`, or `amount` |
| `sort_direction` | `asc` or `desc` |

The JSON body remains an array for frontend compatibility. Pagination metadata is returned in `X-Total-Count`,
`X-Page`, and `X-Page-Size`; these headers are exposed through CORS.

## Draft and lifecycle endpoints

- `POST /api/v1/requests` creates an incomplete or complete owned draft.
- `GET /api/v1/requests/{id}` returns one visible request. Privileged System Administrator/Finance reads are audited.
- `PATCH /api/v1/requests/{id}` updates an owned draft/returned request using its `version`.
- `DELETE /api/v1/requests/{id}` deletes an eligible owned draft.
- `POST /api/v1/requests/{id}/submit` validates and submits using `version` plus `Idempotency-Key`.
- `POST /api/v1/requests/{id}/return`, `/cancel`, `/reopen`, and `/resubmit` enforce lifecycle permissions and versions.

Successful mutations return the complete request, its lines, and the incremented version. A stale or simultaneous
mutation returns HTTP `409`; callers must reload before applying another edit. Repeating a submit/resubmit with the same
actor, action, and idempotency key returns the originally stored result.

## Validation errors

Errors use `application/problem+json`. Type-specific submission failures include field-addressable errors:

```json
{
  "type": "https://payments.local/problems/http_error",
  "title": "Request failed",
  "status": 422,
  "detail": "Request is incomplete",
  "code": "http_error",
  "request_id": "correlation-id",
  "errors": [
    {"field": "lines.0.cost_center_id", "message": "Line 1: cost center is required"}
  ]
}
```

Schema-validation errors use code `validation_error`. Decimal constraint metadata is JSON-safe and cannot turn an
expected HTTP `422` into an internal error.

## Amount, currency, and cost-center rules

- Every request total and line amount is paired with an ISO currency code.
- A request is single-currency; every line must match it.
- Amounts support at most 15 integer digits and four decimal places.
- Each line represents one item and has exactly one cost center. Different cost centers require separate lines.
- General Payment does not use a request-level particulars field. Empty frontend breakdown rows are omitted; once any
  value is entered in a row, every required field for that row must be completed before submission.
- The exact Decimal sum of all lines is the authoritative request total.

## Draft retention

Draft responses include `draft_expires_at` and `draft_retention_warning`. The default retention period is 90 days and
the warning begins seven days before expiration. The explicit maintenance command changes expired drafts to `archived`,
increments their version, timestamps `archived_at`, and records `payment_request.draft_archived`; it never deletes them.

```powershell
docker compose run --rm -e DRAFT_ARCHIVAL_ENABLED=true app python -m payment_module.maintenance archive-drafts --dry-run
docker compose run --rm -e DRAFT_ARCHIVAL_ENABLED=true app python -m payment_module.maintenance archive-drafts
```
