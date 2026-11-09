# Supabase database for Mfaro HR & Payroll

Selected project: **gicagqonnngawnoapdyz**

Dashboard: https://supabase.com/dashboard/project/gicagqonnngawnoapdyz

This is the selected hosting target, not confirmation that a migration has run. At preparation time the connected Supabase integration could not access this project. No database objects, credentials or existing records in the project have been changed.

## Architecture

Supabase supplies PostgreSQL. The existing application continues to use Prisma and Better Auth through its Next.js server. This setup does not require replacing the application's sign-in with Supabase Auth or sending SQL credentials to the browser. Private document files remain separate from the relational database; the Vercel deployment supports a private Vercel Blob store.

## Required access

Grant the connected Supabase integration access to this project and its owning organization. The integration must be able to inspect the project, list tables and apply the reviewed schema changes. A project link alone does not grant database-management access. Do not paste database passwords, service-role keys or other secrets into chat.

## Inspect before migrating

1. Confirm the project reference and project health through the Supabase tools.
2. Inspect the existing tables and migration history. `scripts/supabase-preflight.sql` supplies additional **read-only** checks for Mfaro's expected table names, column shapes, RLS and Data API role privileges.
3. If any expected names already exist, compare the actual schema and Prisma migration history before proceeding. Do not run an initial migration over conflicting tables, reset the database, drop another application's schema or blindly mark an unverified migration applied.
4. If this project already serves another application, agree on an isolated schema or a dedicated project before changing the application's schema configuration. The current repository defaults to `public`; an isolated schema requires a reviewed application/migration change.

## Connection configuration

Open the Supabase project's **Connect** dialog and copy its actual pooler connection strings. Do not infer the regional pooler hostname from the project reference.

| Variable | Supabase connection |
|---|---|
| `DATABASE_URL` | Transaction pooler, usually port `6543`, for Vercel runtime traffic |
| `DIRECT_URL` | Session pooler, usually port `5432`, for controlled Prisma migration commands; a direct connection can be used where IPv6/network support permits |

Use a dedicated least-privilege server database role for application traffic. Keep schema-management permissions in a separate migration role. URL-encode passwords and use the provider's TLS/certificate settings. Never disable certificate validation just to make a connection work.

The application already limits its reusable PostgreSQL pool to three connections per instance. `prisma.config.ts` uses `DIRECT_URL` for migrations when supplied and falls back to `DATABASE_URL` for ordinary local setups. Supply the real connection strings through Vercel's server-only environment settings, not `NEXT_PUBLIC_` variables or GitHub source files.

## Schema and access controls

The initial schema is tracked at `prisma/migrations/202611080001_initial/migration.sql`. It includes Better Auth tables, organisations, memberships, employees, effective-dated salaries, module records, payroll runs/lines and audit records.

After inspection, apply the Prisma migration through the intended migration connection:

```sh
npm ci
npm run db:generate
npm run db:migrate
```

Preserve Prisma's migration history. If schema creation is performed through Supabase's SQL/migration tools instead, reconcile and verify the matching Prisma baseline before running `prisma migrate deploy`; otherwise Prisma can attempt to recreate existing tables.

Before any business records are inserted:

- Enable RLS on every Mfaro table in any exposed schema, including `public`.
- Keep `anon` and Supabase `authenticated` roles from accessing Better Auth credentials, payroll, salary, identity and bank records. Do not add generic `TO authenticated USING (true)` policies.
- Apply narrowly scoped server-role policies/permissions consistent with the application's server-side organisation checks. Better Auth user IDs are not Supabase Auth IDs; `auth.uid()` policies cannot be assumed to match this application's users.
- Avoid granting schema-creation or superuser privileges to the runtime role. Do not disable the entire project's Data API if that could affect another application.
- Run Supabase's security/performance advisors and test the actual restricted runtime connection after changes.

These access controls must be implemented against the inspected project; this guide does not apply them automatically or imply that they already exist.

## Data and validation

No local database or demonstration data is copied automatically. After migrations and access controls are verified, a new empty demonstration database can be populated with the supplied fictional seed using a privately configured strong `LOCAL_DEMO_PASSWORD` and `APP_MODE=demo`:

```sh
npm run db:seed
```

Do not run that seed on an existing live employee database. A live-data migration needs a separate reviewed export/import and reconciliation process.

Verify connectivity, table/constraint presence, tenant isolation, own-payslip access, monthly payroll approval/finalisation, duplicate prevention, loan timing and report reconciliation. Confirm that Supabase's public API roles cannot read the sensitive tables. Record actual test outcomes; a prepared SQL file is not a completed migration.

See [Vercel deployment](VERCEL-DEPLOYMENT.md) for application hosting. Live statutory payroll remains blocked until the outstanding requirements in `SPECIFICATION-STATUS.md` are implemented and verified.

Official guidance: [Prisma on Supabase](https://supabase.com/docs/guides/database/prisma), [database connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
