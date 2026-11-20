# Vendor directory

Vendor Directory supports create and view using the existing vendor-adapter JSON fields. New vendors persist in vendor_records as JSONB; seeded adapter vendors remain visible. GET /api/v1/vendors and GET /api/v1/vendors/{id} combine both sources. POST /api/v1/vendors requires master_data.manage and CSRF; viewing requires vendors.read. IDs are server generated. Duplicate names return 409; unknown fields are rejected, including bank-account fields. Incomplete vendors remain visible in the directory but are excluded from request selection.

The create form captures contact, address, tax, registration and commercial fields. businessDocuments metadata may be supplied through the API and is shown in the details view. This does not upload business-document files. The external vendor provider remains unconnected; these records use local database storage.
