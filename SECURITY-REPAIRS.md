# Security and correctness repairs — 14 November 2026

This update repairs findings F1–F6 from the code inspection.

- Employee edits merge allowed profile changes and retain approved banking details, leave balances and omitted policy fields. Banking changes continue through independent approval.
- Payroll input mutations, archive/import and payroll processing share an organization transaction lock. Archive and import invalidate affected editable payroll approvals. Finalised runs remain immutable.
- Record edits require the version shown by the editor, recheck status inside the transaction, and update atomically by organization, version and status. Conflicts return 409.
- Request creators and linked employees cannot approve/reject/disburse their own requests. Each module has explicit allowed state transitions; loans must be approved before disbursement.
- Workspace reads enforce employee/department filters in PostgreSQL, use bounded pages and expose continuation cursors. The interface provides load-more controls and identifies partial summaries. Salary history is explicitly limited to the latest 20 entries; payroll calculation still reads complete salary inputs.
- Payroll run responses omit the large immutable snapshot and paginate employee calculation lines. Exports query separately, include all matching rows up to 5,000, and reject larger exports explicitly rather than silently truncating them.
- Unexpected server exceptions return a generic 500 and correlation ID. Known conflicts use 409; malformed requests, oversized JSON and unsupported content types use appropriate client errors.
- Business POST actions have a durable per-user/organization rate counter (60 actions per minute), bounded JSON bodies and existing origin checks.
- Dependencies were updated: Blob 2.9.x, esbuild 0.28.2, a patched OIDC dependency (4.0.9), and ExcelJS's UUID dependency (11.1.1). Overrides are recorded in package.json/package-lock.json. CI now runs npm audit.

## Validation

- TypeScript: passed.
- Unit tests: 18 passed.
- Database/API suites: all 4 passed, using a separate UTF-8 PostgreSQL fixture database and generated fictional accounts.
- Production build: passed without warnings.
- Read-only product tour build: passed.
- npm audit after installation: zero vulnerabilities at all severities.
- Integration coverage includes bank/profile preservation, salary/input invalidation, archive/import invalidation, same-version concurrent edits, stale edits after approval, own attendance rejection, request-creator rejection, loan approval/disbursement order, pagination without duplicates, department/employee scopes, complete CSV export across workspace pages, XLSX generation, attachment persistence and ownership, payroll duplicate prevention and reversals.

No existing user database records were changed by the regression tests. No schema migration is needed for these repairs. The existing Supabase schema is compatible. Credentials and disposable test environment files are excluded from source control and release archives.

These repairs do not implement the outstanding product features listed in SPECIFICATION-STATUS.md, including live statutory calculations, MFA, password recovery, user invitations, malware scanning and production backup/restore operations. A zero-advisory scan is not a penetration-test certification. Vercel deployment remains pending the previously denied workspace access.
