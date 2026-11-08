# Deploy Mfaro on Vercel

Vercel can run this Next.js application, including its authenticated API. It needs an external PostgreSQL database and a **private** Vercel Blob store. The existing GitHub Pages deployment remains a separate read-only tour.

The repository includes `vercel.json`, a Prisma-aware build command, a small reusable database pool, separate migration connection support and private Blob document storage. No cloud account, database or Blob store is created by these source files.

## Create the services

1. Sign in to Vercel and import `andrewmadume/MfaroHR-Payroll` from GitHub. Use the Next.js preset, repository root and Node.js 24. The build command is defined in `vercel.json`.
2. Connect PostgreSQL through Vercel Marketplace, such as Neon or Prisma Postgres, or use an existing compatible PostgreSQL provider. Choose a region near the Vercel function region. Use a pooled URL for application traffic and a direct URL for migrations when the provider supplies both.
3. In the project's Storage tab, create a Blob store with **Private** access. Connect it to the project. Its server-only `BLOB_READ_WRITE_TOKEN` must be available to the appropriate deployment environment.
4. Configure the variables below. Use separate databases and Blob stores for preview and production. Never connect pull-request previews to the production employee database.

| Variable | Value |
|---|---|
| `DATABASE_URL` | PostgreSQL pooled connection string, using the provider's required TLS settings |
| `DIRECT_URL` | Direct PostgreSQL connection string for Prisma migrations, when provided |
| `BETTER_AUTH_SECRET` | A randomly generated secret of at least 32 bytes |
| `BETTER_AUTH_URL` | The stable HTTPS application URL, including a custom domain if used |
| `DOCUMENT_STORAGE` | `vercel-blob` |
| `BLOB_READ_WRITE_TOKEN` | Token for the connected **private** Blob store |
| `APP_MODE` | `demo` for this release |

Do not paste these secret values into chat, commit them, or prefix them with `NEXT_PUBLIC_`. Vercel's secret environment-variable controls keep them on the server. `DOCUMENT_DIRECTORY` is only used by local/long-lived Node deployments and is not a persistent-storage option on Vercel.

## Initialise the database before using the application

From a trusted terminal with the intended database URLs configured:

```sh
npm ci
npm run db:generate
npm run db:migrate
```

For a new **fictional demonstration database only**, set `APP_MODE=demo` and choose a strong `LOCAL_DEMO_PASSWORD`, then run:

```sh
npm run db:seed
```

This provisions the six representative demo accounts described in `README.md`. Keep the demonstration password private. Remove that seed password from hosted environment variables after provisioning; the running application does not need it. Do not seed a database containing real employee records. User invitation and production administrator provisioning remain unfinished requirements.

Migrations and seeding are deliberately **not** part of `vercel:build`. A preview build must not modify a production database. Run pending migrations through a controlled deployment process against the intended database before deploying schema-dependent code.

## Deploy and verify

Deploy after services, variables and schema are ready. If the project URL changes, update `BETTER_AUTH_URL` and redeploy. Preview environments need their own trusted stable URL and isolated resources.

Check sign-in, organisation scope, own-payslip access, payroll preparation and separate approval, request persistence, report generation and private document upload/download. Reload the application to confirm data is in PostgreSQL. Verify document downloads require the signed-in user's permission and cannot be fetched through public Blob URLs.

Hosted server uploads are capped at **4 MB per document**, below Vercel's 4.5 MB function payload limit. Local development retains the 5 MB limit. Files larger than the hosted cap require a future authenticated direct-upload workflow. Private Blob storage is used on Vercel; there is no fallback to ephemeral local files if its token is missing.

Existing local attachments are not uploaded automatically. Their records remain intact, but the file bytes must be migrated deliberately into the correct private organisation namespace before they can be downloaded from Vercel. PostgreSQL records are not automatically copied between your local and hosted databases.

This is deployment preparation, not proof of a live Vercel deployment. Live PostgreSQL and private Blob behaviour can only be verified after your account and resources are connected. Hosting does not complete the outstanding production requirements or enable live statutory payroll; see `SPECIFICATION-STATUS.md`.

Official references: [Postgres integrations](https://vercel.com/docs/postgres), [private Blob storage](https://vercel.com/docs/vercel-blob/private-storage), [function payload limits](https://vercel.com/docs/functions/limitations).
