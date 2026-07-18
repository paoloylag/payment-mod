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

## Project structure

- `index.html` loads the static browser prototype.
- `src/prototype.js` is the runtime used by the deployed static preview.
- `src/App.jsx` contains the synchronized React implementation.
- `src/styles.css` contains screen, responsive, and print styling.
- `.github/workflows/pages.yml` defines the GitHub Pages deployment.

## Covered workflow

- Payment request creation for reimbursement, liquidation, cash advance, P.O. payment, and general payment requests.
- Form structures based on the supplied LCI reimbursement, liquidation, and cash advance references.
- Placeholder-based text inputs, calculated totals, multiple line items, and department/cost-center allocation.
- Type-specific validation rules and required or conditional document uploads.
- Grouped navigation for overview, requests, processing, and records.
- Clickable dashboard metrics with dedicated request lists and detail views.
- Department Head, Finance Associate, Finance Manager, COO, President, and Board Member review paths.
- Standardized approval actions for consistent approver views.
- Threshold routing for budgeted and unbudgeted payments, including Board Member approval only for unbudgeted payments above PHP 1,000,000.
- Full-width printable payment vouchers with compact half-page content, payment details, and an amount summary.
- Approver email samples for each workflow stage.
- Clickable Payment Tracker rows with dedicated request and workflow details.
- Unclaimed-check reporting, archive search, and an ERP posting queue concept.

## Prototype scope

This repository currently demonstrates front-end workflow behavior with sample data. It does not yet include authentication, persistent storage, file processing, email delivery, banking integrations, or ERP connectivity.
