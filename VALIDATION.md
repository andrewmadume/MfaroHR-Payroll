# Delivery validation

Checked on 8 November 2026 using the supplied Windows workspace.

| Check | Result |
|---|---|
| PostgreSQL setup | Real local PostgreSQL 18 cluster connected successfully; UTF-8 database created and Prisma migration applied |
| Seed | 18 fictional employees, six role accounts, three branches, six departments, requests/tasks and historical payroll inserted |
| TypeScript | `tsc --noEmit` passed |
| Production build | `next build --webpack` passed, including all authenticated API routes |
| Calculation/permission unit tests | 10 tests passed: decimal rounding, proration, loan cap, employer cost, invalid inputs, negative pay, effective dates, unpaid leave segments, mixed-currency rejection, stage controls, working days/overlaps and role/record scope |
| API integration tests | 2 grouped tests passed, covering unauthenticated access, employee ownership, cross-organisation rejection, export permissions, PDF generation, preparation/approval separation, loan timing, concurrent/repeated finalisation, duplicate rejection, net reconciliation and linked reversal/loan restoration |
| Desktop interface | Browser checked at 1440 × 1000; dashboard layout, navigation and labelled employee form inspected |
| Mobile interface | Browser checked at 390 × 844; sidebar adaptation, cards, chart and department layout inspected. After fixes, document/body width was 375 CSS px with the 15 px scrollbar, within the 390 px viewport |
| Product tour | Static bundle built successfully from the same React interface; all mutations explicitly read-only |

The API integration payroll test creates its own uniquely named test organisation and removes that fixture afterward. Earlier development runs used the fictional demonstration organisation, so the local database can contain additional November demonstration payroll runs in different stages; the static tour uses deterministic fixtures.

## Verification limits

The checks above are not a complete production acceptance test. There has been no live payroll, payment transmission, external email, country compliance review, penetration test, load test or end-to-end backup restoration. PDF generation was checked through authenticated API delivery and its PDF signature, not an exhaustive visual audit of every report or long employee name. Keyboard-accessible native forms/dialogs and labels were inspected, but a full screen-reader and WCAG audit remains outstanding. CSV validation and private upload paths exist; a full adversarial import/document suite remains to be written.

`SPECIFICATION-STATUS.md` identifies unfinished functionality. No unfinished feature should be inferred complete from the module navigation or this validation report.

## Vercel preparation

Added a private Vercel Blob storage adapter, small PostgreSQL pool, pooled/direct connection separation, Vercel build configuration and deployment guide. Five additional unit tests cover document signatures, platform upload limits, tenant namespaces, local persistence and refusal to fall back to ephemeral storage on Vercel. The authenticated API suite also checks attachment persistence after metadata edits, ownership and organisation isolation.

Actual PostgreSQL and private Blob operations on Vercel still require a connected workspace and cloud resources; local/CI success does not establish a live deployment.
