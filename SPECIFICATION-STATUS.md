# Specification delivery status

This checklist distinguishes implemented workflows from remaining work. A visible module does not imply every feature in that module is complete. This release is a working demonstration foundation, not a full production HRIS or compliant payroll engine.

| Area | Implemented and persisted | Remaining work |
|---|---|---|
| Identity and design | Supplied logo; branded tokens; collapsible/mobile sidebar; menus; scoped search; labelled forms; responsive tables and dialogs | Broader assistive technology review; high-contrast typography audit across every screen |
| Architecture | Next.js/TypeScript, Tailwind, PostgreSQL/Prisma, migrations, Better Auth, decimal service, seed and environment examples | Production infrastructure provisioning and operational hardening |
| Organisation and roles | Tenant-scoped queries/actions/exports; six fixed roles; department/employee scope; multiple memberships; organisation picker | Organisation creation wizard, invitations, role/user administration, configurable permission grants and branch/department master-data UI |
| Dashboards | Counts from stored authorised records; payroll totals/trends, requests and audit activity; linked cards | Full birthday/anniversary/contract reminder automation; all requested role-specific dashboard variants |
| Employees | Create/edit/archive, salary history, branches/departments, profile fields, CSV validation/import, exports, account membership revocation on archive | Employee photographs, comprehensive qualifications/emergency contacts, sensitive profile change self-service, data export field configuration |
| Recruitment | Vacancy/candidate register, stage transitions, interview dates and notes | Multiple candidates per vacancy, interview scheduling integration, offer/appointment templates, automatic employee conversion |
| Onboarding | Assigned tasks, owners/dates, progress and completion | Configurable checklist templates, document collection automation and probation reminders |
| Attendance | Clocking records, corrections, overnight date validation, UTC conversion in supported timezones, approved overtime integration | Shift assignments, device API, CSV attendance import, full timesheet approval policies and arbitrary DST-aware timezones |
| Leave | Full/half-day requests, weekdays/holidays, overlap and annual balance checks, decisions/cancellation, balance overview, unpaid integration | Accrual/carry-over/expiry engine, leave ledger, configurable employee schedules/eligibility, supporting attachments and calendar views |
| Payroll calculation | Monthly salaries, allowances, manual deductions/contributions, effective-date segments, approved overtime/unpaid leave, loan cap, explainable decimal calculation | Weekly/fortnightly/hourly cycles, configurable proration/precision, bonuses/commissions and arbitrary components, payroll variance alerts and off-cycle adjustment entry |
| Country rules | Clear unverified demo labels; server blocks live finalisation | No supported live country. Effective-dated tax/statutory rule administration, official source verification and compliance validation are not implemented |
| Payroll control | Five stages, reasoned rejection, self-approval prevention, reset on input changes, immutable final snapshots, transactional loan updates, regular duplicate check, concurrent finalisation lock, linked reversals | Cross-period correction allocation, payment-provider integrations and broader concurrency/load certification |
| Payslips/payments | Authorised PDF payslips with historical snapshots and YTD net; separate payment status; confirmation action; CSV/XLSX/PDF register exports | Scheduled payment dates, full YTD breakdown, bulk zipped payslips, configurable bank formats, bank account mapping and transaction-level reconciliation |
| Loans/benefits | Applications/register, approval/disbursement states, balances/instalments, finalisation-only repayments and reversal credit | Full repayment schedule ledger, configurable deduction limits, benefit valuation and contribution policy engine |
| Performance/training | Scoped goals/reviews, rating/feedback/response fields, training/certification register, dates and completion | Review templates, multi-rater cycles, employee response-only specialised UI, course attendance rosters and expiry notification automation |
| Exit management | Employee archive with historical payroll retained and linked membership revoked | Dedicated resignation/termination workflow, exit/asset checklists, verified final pay and complete user session revocation across organisations |
| Self-service | Own employee records, attendance/leave requests, payslip access and downloads, own loans, assigned tasks/documents | Profile and bank-change self-service approval forms, announcements, comprehensive manager calendar and inbox |
| Reports | Payroll register, employee/leave/attendance/loan/payment exports and audit table | Accounting mappings/journal, turnover and variance reports, all requested filters, report-specific PDF layouts and scheduled reports |
| Documents/notifications | Private PDF/PNG/JPEG storage, Vercel private Blob adapter, signature/size checks, per-download authorisation, document metadata, request notifications and persisted read state | Malware scanning, live cloud storage verification, configurable emails/retries/delivery status, expiry reminders and retention enforcement |
| Organisation settings | Name/currency/supported timezone editing; fixed role visibility; self-approval prevention; demo safeguards | Most configurable policies, salary components, calendars, role controls, templates and integrations are not yet exposed |
| Security and operations | Provider-hashed passwords, database sessions, database-backed auth rate limit, origin checks, tenant scopes, input validation, private files, audit records, secret separation | MFA, password resets, invitation flow, durable business-action throttling, comprehensive penetration review, backups/restore implementation and operational certification |
| Demonstration records | 18 fictional employees, 3 branches, 6 departments, six accounts, multiple workflow states, historical payroll and payslips | Actual organisation onboarding and live rule data intentionally absent |
| Validation | Calculation and permission unit tests; opt-in API integration tests; Next production build/typecheck; responsive browser checks | Full accessibility audit, all jurisdiction tests, exhaustive import/PDF coverage, large-scale load and all role/workflow combinations |

## Implementation stages

1. **Authentication, organisation and permissions:** functional fixed-role foundation; administration/configuration unfinished.
2. **Employees, attendance and leave:** core persisted requests and records functional; policy engines and integrations unfinished.
3. **Payroll review, approval and finalisation:** functional monthly demonstration workflow with safeguards; live countries and additional cycles unfinished.
4. **Payslips, payments and reporting:** individual PDF and register exports functional; bank/bulk/accounting workflows unfinished.
5. **Recruitment, onboarding, performance, training and exits:** registers and task workflows present; full lifecycle automation and exit module unfinished.
6. **Interface, tests and documentation:** core verification performed; production acceptance remains outstanding.

Do not use real employee identities, bank information or live salaries in the hosted tour. The full application needs the outstanding production controls before handling live payroll.
