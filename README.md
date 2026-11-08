# Mfaro HR & Payroll

[Repository](https://github.com/andrewmadume/MfaroHR-Payroll) · [GitHub deployment guide](GITHUB-DEPLOYMENT.md) · [Vercel deployment guide](VERCEL-DEPLOYMENT.md) · [Live read-only demo](https://andrewmadume.github.io/MfaroHR-Payroll/)

Mfaro is a responsive HR and payroll application built with Next.js 16, React 19, TypeScript, Tailwind CSS 4, PostgreSQL, Prisma 7 and Better Auth. It includes fictional demonstration records and six separate role accounts. The supplied Mfaro logo is included.

**Delivery status: working demonstration application, with a production foundation. This is not a complete implementation of the entire supplied specification and is not approved for live payroll.** Read [SPECIFICATION-STATUS.md](SPECIFICATION-STATUS.md) before using it with real people or financial data. No country-specific tax or statutory regime is implemented or verified. Live payroll finalisation is blocked on the server.

The hosted Site is a **read-only product tour**, built from the same interface with fictional fixture data. It does not connect to the local database or store business records. The complete server-backed application runs locally or on a Node.js host with PostgreSQL. A GitHub Pages workflow is included for the read-only `dist/` tour; see `GITHUB-DEPLOYMENT.md` to enable it.

## Start locally on Windows

Requirements: Node.js 22.12+ or 24 LTS, npm, and an internet connection for the first install. The Windows x64 development helper installs a real embedded PostgreSQL server inside this project. It does not install a Windows service or alter an existing database.

Clone the repository and open its folder:

```powershell
git clone https://github.com/andrewmadume/MfaroHR-Payroll.git
cd MfaroHR-Payroll
```

Then run:

```powershell
npm install
npm run local:setup
npm run local:start
```

Open **http://127.0.0.1:3000**. Setup creates `.env` with random database and authentication secrets and a random local demo password. Open `.local/credentials.txt` to see the local password. These files are excluded from Git and the downloadable source archive.

The six local email addresses are:

| Email | Role |
|---|---|
| admin@mfaro.example | Organisation administrator |
| hr@mfaro.example | HR manager |
| payroll@mfaro.example | Payroll officer |
| approver@mfaro.example | Payroll approver |
| manager@mfaro.example | Department manager, Technology |
| employee@mfaro.example | Employee, Nyasha Ncube |

All use the generated password, **only in the local fictional demonstration**. Sign out through the profile menu to change roles. Repeated setup does not overwrite existing records or reset passwords. Stop the local server with Ctrl+C. Data remains in `.local/postgres/` between launches.

If port 55432 is occupied, edit the database port in `.env` before setup. If port 3000 is changed, update `BETTER_AUTH_URL` too. The local attendance implementation supports UTC, Africa/Harare and Africa/Johannesburg. All database timestamps use PostgreSQL timestamps; imported local clockings are explicitly converted to UTC using the supported timezone.

## Use an existing PostgreSQL database

Copy `.env.example` to `.env` and fill in your own values. Use a dedicated empty database; do not point setup at an unrelated database.

```powershell
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Seeding requires `APP_MODE=demo` and a strong `LOCAL_DEMO_PASSWORD` of at least 12 characters. The seed is idempotent and adds 18 fictional employees, branches, departments, salary histories, leave, attendance, loans, vacancies, tasks, reviews, training, document register entries and six months of historical payroll. The historical payroll records are illustrative fixtures, not evidence of actual approval activity.

## Try the payroll workflow

1. Sign in as `payroll@mfaro.example` and open Payroll. Create a Monthly Regular run for an unused month and one explicit currency.
2. Open its details and calculate. Expand an employee line to inspect the earnings, deductions, employer contributions and calculation explanation. Only approved attendance and unpaid leave are used; only disbursed loans are deducted.
3. Submit for review. Sign out and sign in as `approver@mfaro.example`.
4. Approve, then finalise. Finalisation creates immutable snapshots and reduces loan balances in one database transaction. Self-approval is prevented even for administrators.
5. Download payslips in Payslips & Payments. A PDF/CSV/Excel export does not mark anyone paid.
6. Confirm a payment with a reconciliation reference. This records a confirmation; **no money is transferred**.
7. To undo a finalised run, the preparer can create one linked reversal. Its amounts offset the original snapshot. Submit it to a different approver and finalise it to restore loan repayments. The original record remains intact.

Changing employee salaries or approved payroll inputs resets unfinished payroll runs to Draft and removes prior approval. Recalculate and resubmit them. Completed snapshots are never recalculated from current employee data. Duplicate regular payroll for an employee, period and currency is rejected when finalising. Concurrent finalisation uses an organisation-level transaction lock plus uniqueness constraints; a serialization conflict returns an error and can be retried safely.

## Calculations

`lib/payroll.ts` contains the shared calculation service. Decimal.js uses 32 significant digits and half-up rounding. Each run has one currency. Gross earnings less employee deductions equals net pay; employer contributions and total employer cost are separate.

The implemented cycle is **Monthly only**. Salary basic and allowance amounts are monthly amounts. Working days are Monday–Friday less configured holidays. Mid-period salary changes use each effective salary segment, employment start and approved unpaid leave days. Segment values accumulate in decimal precision before rounding the final earnings line to two decimal places. Approved overtime uses the manually configured approved hours and rate. Other deductions and employer contributions are fixed period amounts from the latest effective salary. Loan repayments are capped at the outstanding balance. Negative net pay is rejected, except in a linked reversal that explicitly offsets the original snapshot.

The demo's other deductions and employer contributions are manually entered examples, **not tax or statutory formulas**. The system provides no jurisdiction compliance claim. All supported demo currencies use 2-decimal precision; other precision rules are unfinished.

## Imports, files and exports

Employees supports CSV imports of up to 200 rows and a 2 MB client file limit. Validate every row before saving; the server validates again and commits the import transactionally. Required headers: `name,email,number,jobTitle,department,branch,startDate,currency,basic,effectiveFrom`. Optional numeric headers: `allowance,deduction,contribution`. Dates use `YYYY-MM-DD`. Example:

```csv
name,email,number,jobTitle,department,branch,startDate,currency,basic,effectiveFrom
Example Person,person@example.test,EXAMPLE-001,Coordinator,Operations,Harare Head Office,2026-11-01,USD,1500,2026-11-01
```

Documents supports private PDF/PNG/JPEG attachments up to 5 MB, checked by signature and stored under random filenames outside `public/`. Every download checks organisation membership, module permission and employee ownership. Seeded document register entries have no file until one is uploaded. Private Vercel Blob storage is supported for Vercel deployments; see `VERCEL-DEPLOYMENT.md`. Hosted server uploads are capped at 4 MB; local uploads remain capped at 5 MB. Antivirus scanning, DOCX uploads and automatic retention are not implemented.

CSV, XLSX and PDF exports use the same authorised state as the interface. Payroll reports use finalised snapshot lines. CSV cells are protected against formula injection. Filters for department, currency and period are supported in the export endpoint; the interface currently exposes department where relevant. The full report-filter set in the specification remains unfinished. PDF payslips include earnings, deductions, separate employer contributions, YTD net pay, unique references and demo notices.

## Verify the application

```powershell
npm run typecheck
npm test
npm run build
```

The API integration suite is opt-in and requires the local seeded application running on port 3000:

```powershell
$env:RUN_INTEGRATION='1'
npm test
Remove-Item Env:RUN_INTEGRATION
```

Integration tests use a separate, uniquely named disposable fixture organisation for payroll mutations, then delete only that fixture. They verify unauthenticated requests, organisation isolation, own-record/payslip access, PDF generation, export permissions, separate payroll preparation/approval, loan timing, concurrent finalisation, duplicate processing, reconciliation and linked reversals. Do not run them against production. See `VALIDATION.md` for the delivery checks and their limits.

## Deploy the full application

For Vercel, follow `VERCEL-DEPLOYMENT.md` and connect PostgreSQL plus a private Blob store. For a long-lived Node.js host, use PostgreSQL and a private persistent file volume. The static hosted product tour is not a deployment of the full server application.

1. Provision a dedicated PostgreSQL database with TLS, encryption at rest, restricted networking and backups. Use a least-privilege application database user.
2. Configure `DATABASE_URL`, a random `BETTER_AUTH_SECRET`, an HTTPS `BETTER_AUTH_URL` and a private persistent `DOCUMENT_DIRECTORY`. Supply secrets through the host's secret manager. Never commit `.env` or `.local`.
3. Run `npm ci`, `npm run db:generate`, `npm run db:migrate`, `npm run typecheck`, `npm test` and `npm run build`, then `npm start` behind HTTPS. The package binds to loopback for a reverse proxy; adapt this deliberately for a container host.
4. Do not run the demonstration seed with real organisational data. Administrator provisioning, user invitations, MFA, password reset delivery, membership administration and configurable permissions need implementation before production use.
5. Protect the service with request size limits and durable distributed rate limiting for business mutations. Better Auth's login rate limiting is database-backed. Public sign-up is disabled. Cookies use HTTPS protection when the configured base URL is HTTPS.
6. Set and validate retention, document malware scanning, monitoring and disaster recovery. External email delivery is absent, so no demonstration emails are sent.
7. Keep payroll in demo mode. **Country-specific rules, legal verification and the remaining controls in the specification must be implemented before live operation.** Changing a mode flag does not enable live finalisation; the server blocks it.

Do not publish the source archive, database files or local credentials as a static website. `.gitignore` excludes runtime data and secrets; GitHub Pages only publishes the `dist/` read-only tour.

## Backup and restoration

Use your PostgreSQL provider's encrypted automated backups and point-in-time recovery. For a self-managed server, run `pg_dump --format=custom` with credentials supplied through protected environment variables or a restricted service account. Back up `DOCUMENT_DIRECTORY` separately; it contains private attachments. Protect backup access and retention to the same standard as the live database.

Restore into a separate empty PostgreSQL database with `pg_restore`, restore the matching private document volume, configure a separate secret and base URL, and run a restore drill. Verify membership isolation, record counts, finalised snapshot totals, document authorisation and payslip reconciliation before routing traffic. Never restore an unverified backup over the only live database. Schema migrations are in `prisma/migrations`; apply only pending migrations, preserving existing migration history.

## Source map

- `components/workspace.tsx`: responsive application UI and forms.
- `app/api/`: authenticated route handlers, import, document storage and exports.
- `lib/service.ts`: tenant scope, validation, records and payroll workflow transactions.
- `lib/permissions.ts`: six fixed roles and record scope.
- `lib/payroll.ts`: shared decimal calculation and transition rules.
- `lib/document-storage.ts`: local development and private Vercel Blob storage.
- `prisma/`: PostgreSQL schema, migrations and fictional seed.
- `scripts/local.ts`: isolated development PostgreSQL setup and launcher.
- `scripts/demo.ts`: separate read-only static tour build.
- `tests/`: calculation, permission and API integration tests.

Dependencies follow current [Next.js installation guidance](https://nextjs.org/docs/app/getting-started/installation) and [Prisma PostgreSQL adapter guidance](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql). Exact installed versions are recorded in `package-lock.json`.

## GitHub verification

The initial GitHub-hosted PostgreSQL build and integration checks passed on Ubuntu with Node.js 24: [successful application check](https://github.com/andrewmadume/MfaroHR-Payroll/actions/runs/42503700361). The [Pages deployment](https://github.com/andrewmadume/MfaroHR-Payroll/actions/runs/42503842793) also succeeded. These checks verify the demonstration implementation; they do not resolve the unfinished production requirements.
