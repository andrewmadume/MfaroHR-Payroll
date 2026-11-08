# GitHub source and deployment

Repository: https://github.com/andrewmadume/MfaroHR-Payroll

Live read-only demonstration: https://andrewmadume.github.io/MfaroHR-Payroll/

GitHub Pages is enabled with GitHub Actions, and the initial deployment succeeded. The steps below describe how to republish future changes.

This repository contains the application source, PostgreSQL migration, fictional seed, supplied logo, test suite and operational documentation. Local credentials, database files, private attachments, node_modules and generated build output are excluded.

## GitHub Pages

GitHub Pages can serve the **read-only fictional product tour**. It cannot execute the Next.js API, authentication provider, PostgreSQL database or private document storage. Do not describe a Pages deployment as the full application.

1. In repository **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source.
2. Open **Actions → Publish product tour → Run workflow**, using `main`.
3. Wait for both the build and deployment jobs to succeed. GitHub shows the resulting Pages URL on the deployment and in Settings → Pages.

The tour uses relative asset paths so it can run at `/MfaroHR-Payroll/`. Writes, imports and downloads that require the API are disabled in the tour. Its records are fictional bundled fixtures and have no connection to your local database.

The workflow is manual to avoid unintentionally republishing the public tour on every source update. Repeat the workflow after changes you want to publish. Use [GitHub's Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) for platform configuration.

## Full application

Clone the repository and follow `README.md`. Use a Node.js host with a private PostgreSQL database and persistent private document storage. Set environment variables through the host's secret manager. Run Prisma generation/migrations, application checks and the production build before startup.

`APP_MODE=demo` is for fictional data. No country-specific statutory rules are verified; live payroll finalisation is blocked. The complete outstanding scope is recorded in `SPECIFICATION-STATUS.md`.

## Automated verification

`Application checks` runs on pushes to `main`, pull requests and manual dispatch. It uses an isolated disposable PostgreSQL service, generates random authentication/test credentials, then runs migrations, seed, type checks, tests, the Next.js build, API integration tests and the static tour build. The database service password in the workflow is solely for that short-lived CI container; it is not a production credential.

No license was selected on your behalf. Add an appropriate license before distributing the software under open-source terms.
