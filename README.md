# Automated Payment System Prototype

This React-compatible prototype is based on `Automated Payment System.xlsx`.

## Open locally

Serve this folder with any static server and open `index.html`. The checked-in HTML uses a self-contained preview script so it can run without installing dependencies.

Example:

```bash
python -m http.server 8766 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8766/
```

## Publish with GitHub Pages

This folder is ready to publish as a static GitHub Pages site.

1. Create a new GitHub repository.
2. Upload or push the full contents of this folder to the repository root.
3. In GitHub, go to **Settings > Pages**.
4. Under **Build and deployment**, set **Source** to **GitHub Actions**.
5. Push to the `main` branch, or run the **Publish prototype to GitHub Pages** workflow manually from the **Actions** tab.

After the workflow finishes, GitHub will show the public Pages URL in the deployment summary.

### Command-line setup

From this folder:

```bash
git init
git add .
git commit -m "Publish automated payment prototype"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

## Use in a React/Vite app

Install dependencies, then run:

```bash
npm install
npm run dev
```

The React-compatible component source is in `src/App.jsx`, the static preview script is in `src/prototype.js`, and styling is in `src/styles.css`.

## Covered workflow

- Payment request creation with reimbursement, cash advance, P.O. payment, and general payment variants.
- Type-specific document validation and line-item fields.
- Multiple line items with department/cost-center allocation.
- Type-specific required document uploads, including reimbursement cash advance forms.
- Department Head, Finance Associate, Finance Manager, COO, President, and Board Member review paths.
- Threshold routing for budgeted and unbudgeted payments, including Board Member approval only for unbudgeted payments above PHP 1,000,000.
- Printable payment voucher with corresponding payment details.
- Approver email samples for each workflow stage.
- Payment tracker, unclaimed-check report concept, archive search, and ERP posting queue.
