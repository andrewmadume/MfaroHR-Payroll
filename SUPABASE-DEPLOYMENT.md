# Supabase database for Mfaro HR & Payroll

## Hosted database

Installed on **9 November 2026** through the **Andrew-II** Supabase connection.

- Project: **MfaroHR & Payroll** (`gicagqonnngawnoapdyz`)
- Organization: **Mfaro**
- Region: **Frankfurt / eu-central-1**
- Dashboard: https://supabase.com/dashboard/project/gicagqonnngawnoapdyz
- Supabase migration: `20261109082456_mfaro_initial_schema_and_server_access`
- Prisma baseline: `202611080001_initial`
- Baseline SHA-256: `649d4dd5104f70884bc87362ad047465b43cc56cbbf4ad0c51cf4e10e76b4945`

The project was inspected before changes: its public schema and migration history were empty. The existing Prisma initial migration was applied, and its matching checksum was recorded in `_prisma_migrations`. Do not rerun initial CREATE TABLE statements or reset this database.

## Architecture and security

Supabase supplies PostgreSQL. Prisma and Better Auth run in the Next.js server. Document attachments use separate private storage.

All 13 application tables and the Prisma migration ledger have row-level security enabled. All table privileges were revoked from PUBLIC, `anon` and Supabase `authenticated`. Better Auth IDs are not Supabase Auth IDs, so the app does not rely on `auth.uid()`.

The dedicated login role `mfaro_runtime` has schema USAGE and SELECT/INSERT/UPDATE/DELETE on the 13 application tables. Its RLS policies permit this trusted server role to operate across the application tables; organization and employee authorization remain enforced by the application server. This role must never be used by browser code or untrusted clients.

The role cannot create schema objects, create roles or databases, bypass RLS, or access the Prisma migration ledger. PostgreSQL administration and future schema migrations use a separate administrative connection.

A generated runtime password and direct TLS connection URL are stored only in the local ignored file `.local/supabase-runtime.env`. No credentials were committed to GitHub. This direct URL is a connection template based on the project's reported host; an external PostgreSQL login has not yet been verified.

## Verified results

- All 13 application tables, 10 foreign keys and the matching Prisma baseline exist.
- All 14 tables have RLS enabled and deny public API role privileges.
- The runtime role has no superuser, CREATE DATABASE, CREATE ROLE or BYPASSRLS privileges, and cannot CREATE in public.
- A transaction under SET LOCAL ROLE mfaro_runtime inserted a disposable organization, employee and salary, updated the salary, read the joined result (125.2500), and deleted the probe rows.
- The transaction was rolled back; a separate query confirmed zero probe organizations remain.
- Security advisors reported no ERROR or WARN findings. The migration ledger intentionally has RLS with no runtime policy, so only its owner/admin can access it.
- Performance advisors reported informational unused indexes (expected before application traffic) and an uncovered Membership.organizationId foreign key. Consider a tracked Prisma index migration when tuning organization membership queries.

These are database-side permission and CRUD checks, not an end-to-end deployed application test. Local hostname resolution failed in the execution environment, and the dashboard browser required sign-in, so external password authentication and pooler connectivity remain unverified. No existing employee records or local demo database were imported.

## Connect the Vercel application

Open the project's **Connect** dialog and copy its actual regional pooler hostname. Do not infer it from the project reference.

| Variable | Connection |
|---|---|
| DATABASE_URL | Transaction pooler, usually port 6543, using mfaro_runtime and its generated password |
| DIRECT_URL | Session pooler, usually port 5432, using a separate schema-management role |

For pooler usernames, follow the dashboard's format and substitute the custom role (commonly `mfaro_runtime.gicagqonnngawnoapdyz`). URL-encode passwords and retain TLS certificate validation. Do not paste secrets into chat, commit them to GitHub, or use NEXT_PUBLIC_ variables.

The application reuses a PostgreSQL pool capped at three connections per instance. Prisma migration commands use DIRECT_URL when supplied. Configure Vercel server-only environment variables, then test the actual connection before deploying.

Vercel deployment remains pending: the current Vercel connection denied access to the selected workspace. Database hosting alone does not connect or deploy the web application.

## Future migrations and seed data

Use reviewed Prisma migrations through the administrative connection. Preserve existing Prisma history; never blindly resolve unapplied migrations. Keep new tables protected with RLS, revoked public API privileges and explicit server-role permissions.

No demo accounts or fictional employees were seeded remotely. For an explicitly selected empty demo deployment, configure APP_MODE=demo and a strong private LOCAL_DEMO_PASSWORD, then run the supplied seed through the runtime connection. Never run the demo seed on a live employee database.

See [Vercel deployment](VERCEL-DEPLOYMENT.md) and [specification status](SPECIFICATION-STATUS.md). Live statutory payroll remains blocked until the outstanding requirements are implemented and verified.

Official guidance: [Prisma on Supabase](https://supabase.com/docs/guides/database/prisma), [database connections](https://supabase.com/docs/guides/database/connecting-to-postgres), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
