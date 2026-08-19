# Automated Payment System

A front-end workflow prototype for creating, reviewing, approving, tracking, and documenting payment requests. It includes type-specific request forms, approval routing, document requirements, printable payment vouchers, and finance operation views.

Live prototype: [https://paoloylag.github.io/payment-mod/](https://paoloylag.github.io/payment-mod/)

## Open locally

The checked-in HTML and static preview script can run without installing dependencies:

Example:

```bash
python -m http.server 8766 --bind 127.0.0.1
```

Then open [http://127.0.0.1:8766/](http://127.0.0.1:8766/).

For Vite development with automatic reload:

```bash
npm install
npm run dev
```

Create and preview a production build with:

```bash
npm run build
npm run preview
```

## Publish with GitHub Pages

The repository publishes through the GitHub Actions Pages workflow when updates reach `main`. Deployment status is available in the repository's **Actions** and **Deployments** views.

Repository: [https://github.com/paoloylag/payment-mod](https://github.com/paoloylag/payment-mod)

## Phase 0 backend development

Docker Compose is the required local environment. It starts PostgreSQL, applies all migrations, runs the deterministic
foundation seed, and then starts the FastAPI service:

```bash
docker compose up --build
```

The API is available at `http://127.0.0.1:8002`. Use `/healthz` for process liveness, `/readyz` for database readiness,
and `/api/v1/system/status` for the prototype's backend indicator. Stop the environment with `docker compose down`.
Use `docker compose down -v` only when intentionally discarding the local database volume.

CI runs linting, migrations, deterministic seeding, migration rollback/replay, backend tests, and a Docker image build
for pushes to `codex/backend-integration` and `main`, and for pull requests that affect the backend. The image is
packaged as a workflow artifact; deployment remains intentionally gated until a target environment is confirmed.

## Project structure

- `index.html` loads the static browser prototype.
- `src/prototype.js` is the runtime used by the deployed static preview.
- `src/App.jsx` contains the synchronized React implementation.
- `src/styles.css` contains the shared screen, theme, component, and print styling.
- `src/responsive.css` contains the final mobile, half-desktop, drawer-navigation, and desktop layout rules.
- `docs/database-design.md` defines the proposed PostgreSQL schema, workflow records, audit requirements, and Philippine Time timestamp policy.
- `docs/database-design-readable.md` explains the proposed database and workflow in plain language.
- `.github/workflows/pages.yml` defines the GitHub Pages deployment.

## Covered workflow

- Payment request creation for reimbursement, liquidation, cash advance, P.O. payment, and general payment requests.
- A request-type landing page that protects form input from accidental type switching, plus a dedicated My Drafts workspace with seeded examples for every request type.
- Draft saving, auto-save continuation, deletion, and submission to the Department Head, with the permanent request reference generated only after submission.
- Dynamic validation previews that update from completed fields, line-item accounting details, acknowledgements, and document uploads.
- Form structures based on the supplied LCI reimbursement, liquidation, and cash advance references.
- Placeholder-based text inputs, calculated totals, multiple line items, and department/cost-center allocation.
- PHP, USD, EUR, and custom currency selection with currency-aware request displays.
- Reimbursement and liquidation breakdowns with expense account, department-to-charge, and line-level attachments.
- Cash Advance liquidation dates calculated automatically as 15 days after the event end date.
- P.O.-system reference selection with generated requestor, vendor, department, and amount fields.
- Security Bank return instructions for excess cash advances and P.O.-system BIR 2303 reminders for new suppliers.
- General Payment breakdowns without duplicate supplier fields and support for multiple billing/quotation/SOA files.
- Type-specific validation rules and required or conditional document uploads.
- Grouped navigation for overview, requests, processing, and records.
- Persona-based prototype views for Requestor, Finance Associate, Finance Manager, COO, and President, with the original all-access view retained.
- Responsive persona views with overlay drawer navigation for mobile and compact desktop windows, while retaining the full desktop sidebar layout.
- Accessible light and dark themes with consistent card contrast, theme-aware logos and icons, and standardized single-row page headers.
- Clickable dashboard metrics with dedicated request lists and detail views.
- Role-scoped dashboards, navigation, request visibility, and approval queues.
- Finance department filters with Excel-compatible CSV export and print/PDF transaction reports.
- Aging-day indicators with overdue highlighting across live request tables.
- Requestor editing before Document Validation and audited authorized unlocking for urgent later changes.
- A modal full-workflow view that preserves the selected request and dashboard context.
- Department Head, Finance Associate, Finance Manager, COO, President, and Board Member review paths.
- Finance Associate document validation with VAT and EWT classification, copy receipt status, hard-copy reminders, accounting entries, completion date, and optional check number.
- Automatic No EWT handling for requests at or below PHP 3,000, calculated tax summaries, and balanced-entry completion controls.
- Standardized approval actions for consistent approver views.
- Threshold routing for budgeted and unbudgeted payments, including Board Member approval only for unbudgeted payments above PHP 1,000,000.
- Adaptive full-page printable payment vouchers with payment details, amount summaries, and compact digital approval certification.
- Workflow email samples, including a backend-ready completion notification for both the requestor and vendor.
- Standardized View Request email calls to action that open the specific request in the recipient role's approval, validation, or tracking view.
- Separate backend-ready Request Returned and Request Declined email notifications with reviewer comments and requestor-specific links.
- Clickable bank-approval and signatory-approval statuses with recorded actors and timestamps.
- Backend-ready vendor processing and payment pick-up emails, including Finance personnel audit details.
- Payment Available for Pick-up actions with automatic requestor/vendor notification records.
- Clickable Payment Tracker rows with dedicated request and workflow details.
- Unclaimed-check reporting and completed payment tracking.

## Prototype scope

This repository currently demonstrates front-end workflow behavior with sample data. Report exports run in the browser, while email contracts are templates for backend integration. It does not yet include authentication, persistent storage, file processing, live email delivery, banking integrations, or ERP connectivity.
