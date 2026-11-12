# Vendor administration verification — 11 November 2026

Local staging working tree. Automated data uses dedicated payment_module_test/payment_module_e2e databases. The normal local demo was only restarted against the new API image, with no reseeding/reset.

| ID / unit | Expected behavior and check | Method / role / viewport | Result / evidence | Fix / retest |
| --- | --- | --- | --- | --- |
| T01 Navigation and access | System Administrator, Finance Associate and Finance Manager open Vendor Administration; Requestor has no navigation | Automated browser all four roles; manual local System Administrator | Pass; vendor-admin-browser-final.log and manual navigation | No outstanding fix |
| T02 Pending administration | Pending Validation filter finds request-created supplier; protected pending profile has no edit/status shortcuts; Procurement stays read-only | Browser Finance/admin; focused vendor API regressions; manual Procurement source | Pass | No outstanding fix |
| T03 Document verification | All three current supplier files visible; actual content links; replacement requires reason; acceptance is persisted/audited by existing API | Browser Finance Associate correction/acceptance; backend document permission/history tests | Pass | Removed duplicate misleading empty business-documents message; final rerun verifies panel |
| T04 Activation gate | Directory acceptance does not activate supplier; Finance Associate completes request validation/accounting and approval, then supplier is reusable | Complete browser request flow; supplier backend regressions | Pass | No outstanding fix |
| T05 Layout and keyboard | Verification cards and controls fit at 375/768/1440px light; desktop dark; Escape closes panel | Chrome browser, screenshots visually inspected; local manual directory/editor | Pass | Real-device Safari and phone/tablet dark mode not covered |

Five behavior units passed. Automated case counts: 22 focused backend cases (supplier onboarding, vendor CRUD, documents), plus one expanded browser scenario covering the complete flow. Lint, production build and guide generation passed; existing large-bundle advisory remains. Logs: outputs/vendor-admin-tests.log, vendor-admin-browser-final.log and vendor-admin-final-build.log. Screenshots: outputs/vendor-verification-375.png, vendor-verification-768.png, vendor-verification-1440.png and vendor-verification-dark.png.

Document verification uses the existing request-document authorization, audit history and accounting freeze checks. Pending suppliers still activate only on Finance Associate approval of their originating request. No separate approval bypass, Procurement write access, email transmission, production deployment or commit/push is included.
