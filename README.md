# Alexandria Estate Ledger

Source code for a shared estate financial dashboard. **No resident records, bank transactions, workbook, production database or credentials are included.** The live application is private and is not hosted by this public repository.

## Features

- Original workbook cells, formulas, balances and written statuses preserved in a read-only archive.
- House statements, monthly bills, bank history and Venco history.
- Resident read access; owner and appointed recorders can append entries.
- Decimal-safe allocations, vacancy exclusions and generator advance reconciliation.
- Audited corrections and duplicate-save protection.

## Run with your own authorised data

Requires Node.js 22+ and Python 3. The importer targets the workbook layout used by this project; inspect its mappings before using a different layout.

1. Run `npm ci`.
2. Copy `.openai/hosting.example.json` to `.openai/hosting.json` and set your own Sites project ID.
3. Export your authorised workbook as XLSX, then run `python3 scripts/import_workbook.py /absolute/path/to/workbook.xlsx`. An optional second argument sets its private source URL. Never commit the generated `data/` directory.
4. Run `npm run build`, then `npx wrangler d1 migrations apply DB --local`.
5. Run `npm run dev:api` and, in another terminal, `npm run dev -- --host localhost`.
6. Open the local preview. The local development identity is `owner@example.test`; it is not production authentication.

## Production

Deploy privately through Sites with the `DB` binding, generated Drizzle migrations and `OWNER_EMAIL` set through the hosting environment. Do not enable local development mode in production. The worker trusts identity headers injected by Sites; do not expose it on an unprotected origin accepting client-supplied identity headers. Initialise the private archive via the owner-only `POST /api/import` endpoint after deployment.

Source imports are snapshots, not automatic Google Sheets synchronisation. Reconciliation uses a recorder-approved actual cost total and final units. Expense references should be checked before confirmation.

## Verification

`npm test` runs synthetic allocation and reconciliation checks without private data. Production-import and authorisation integration checks live with the private deployment checkout and are deliberately excluded here.
