# ApproveFlow AICTE: Approval & Compliance Command Centre

**Live demo: https://approveflow-rust.vercel.app/login**

Open the link and pick any account on the sign-in page. Nothing needs installing.

A working prototype for **SIH 2026, problem statement SIH26262**: Integrated AICTE Approval Workflow Automation, Compliance Monitoring and Alert Management System.

> **Fictional data only.** Not an official AICTE system. Every institution, person, application and document is invented for demonstration. Automated alerts and escalations support human decisions; they never make them.

## Try it

1. Open https://approveflow-rust.vercel.app/login
2. Choose an account. Each card is a fictional person with one role:
   - **Dr. Asha Verma**, Administrator: people, stage durations, alert rules, reset
   - **Ravi Kumar**, Regional officer: regional records, checks, alerts, reports
   - **Meera Nair**, Bureau officer: scrutiny and returns for clarification
   - **Suresh Pillai**, EVC coordinator: schedules and records visits
   - **Anita Desai**, Committee reviewer: verifies evidence and renewals
   - **Prof. Vikram Rao**, Competent authority: records the final decision
   - **Farah Sheikh**, Auditor: read-only history and reports
   - **Kavya Iyer**, Institution user (Vindhya): files applications and submits evidence
3. Explore. Use **Ctrl K** to jump to any page.

The live site keeps data only while it is running. If something looks different from the last visit, sign in as the Administrator and use **Settings → Reset data**.

The first visit can take a few seconds to load.

## Suggested walkthrough

- **Applications → an application:** watch the stage flow and complete a stage with its checklist.
- **EVC visits:** a visit must be recorded before its stage can close.
- **Undertakings and Documents:** submit evidence or a renewal, then review it as the reviewer, and keep the history.
- **Alerts:** run the checks, then see escalations and duplicates being skipped.
- **Reports and Audit:** export a CSV, and see every action recorded.

## For developers: run it locally

### Setup (Windows, Node 24, npm 11)

```bash
npm install --legacy-peer-deps
npm run db:reset        # creates the local database and loads demonstration data
npm run dev             # open http://localhost:3000
```

`--legacy-peer-deps` is needed because a peer-dependency range between two UI packages conflicts. Nothing else is required: the database is PGlite (Postgres running in-process), stored in `data/pglite`.

Optional: copy `.env.example` to `.env.local` and set `APPROVEFLOW_SESSION_SECRET` to a long random string.

## Commands

| Task | Command |
|---|---|
| Install dependencies | `npm install --legacy-peer-deps` |
| Development server | `npm run dev` |
| Migrate the database | `npm run db:migrate` |
| Seed demonstration data (if empty) | `npm run db:seed` |
| Reset to starting data | `npm run db:reset` |
| Type check | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit and integration tests (Vitest) | `npm test` |
| Production build | `npm run build` |
| Start production server | `npm run start` |
| Browser walkthroughs and screenshots (Playwright) | `npm run test:e2e` (starts the server itself) |

Run `db:reset` only while the server is stopped. Demo Control inside the app can also reset the data without restarting.

## Demo accounts

Sign-in is **demo authentication**: pick a fictional account card. It is not production identity verification.

| Role | Account | What they can do |
|---|---|---|
| Administrator | Dr. Asha Verma | Users, workflow stage durations, alert rules, demo clock, reset |
| Regional officer | Ravi Kumar (Central) | Central-region records, checks, alert actions, reports |
| Bureau officer | Meera Nair | Scrutiny stage, return for clarification, create undertakings |
| EVC coordinator | Suresh Pillai | Schedule and record EVC visits; complete the EVC stage |
| Committee reviewer | Anita Desai | Re-scrutiny and committee stage, verify evidence and renewals |
| Competent authority | Prof. Vikram Rao | Record the final decision (never automatic) |
| Auditor | Farah Sheikh | Read-only: pendency, reports, audit trail |
| Institution user | Kavya Iyer (Vindhya), Arjun Mehta (Narmada), Neha Bisht (Himalaya) | Own institution only: respond, submit evidence, upload renewals |

The role names are proposed for the prototype. They are not official designations.

## What is implemented

| Area | Status |
|---|---|
| Application register: create, search, filter, sort, paginate, detail with timeline | Implemented |
| Configurable workflow templates (5 routes) with ordered stages, roles, checklists, target days | Implemented; templates and checklists are seeded data, durations editable in the UI |
| Stage transitions with validation: no skipping, checklist required, owner-only actions, EVC must be done first, reasons required for returns, decisions by the competent authority only | Implemented and tested |
| Return for clarification, institution response, resumed workflow | Implemented |
| Scrutiny and re-scrutiny queues | Implemented (checklist, observations, clarification) |
| Missing-document indicators and discrepancy flags as dedicated fields | Not implemented (checklist items cover this) |
| EVC queue, status board, month calendar, list view, scheduling, visit completion, report pending | Implemented |
| Undertakings: record, due date, evidence submission with versions, reviewer accept or correction, resubmission | Implemented |
| Document register: versions, renewal upload, reviewer accept or return, history kept, validity states | Implemented |
| Unified monitoring engine: rules, thresholds, one alert per record and threshold, idempotent re-runs, auto-clear, escalation ladder | Implemented and tested |
| Alerts centre: acknowledge, resolve with note, escalation history | Implemented |
| Notifications: in-app, read/unread, mark all read, deep links | Implemented |
| Reports: pendency, ageing, overdue, workload, EVC, undertakings, documents, escalations, audit; region and role filters; CSV export; print view | Implemented |
| Audit trail: append-only (database triggers refuse UPDATE and DELETE on audit and application event tables) | Implemented and tested |
| Role-based permissions and record scoping on every server write and query | Implemented and tested |
| Secure file handling: 10 MB limit, PDF/PNG/JPG by content (magic bytes), authorized downloads, no-sniff headers | Implemented and tested |
| Demo clock and Demo Control (shift the date, run checks, reset) | Implemented |
| Role-specific overview dashboards | Implemented |
| Responsive layout (desktop sidebar, mobile drawer, tables scroll) | Implemented; checked at 390 px wide |
| Command menu (Ctrl+K), keyboard shortcut `/`, reduced-motion support | Implemented |
| Email and SMS | **Not configured.** The UI shows them as not configured. Nothing is sent. |
| Integration with AICTE systems | **Not connected.** No API, credentials or adapter exists. |
| Background scheduler | **Not implemented.** Checks run from the UI button or Demo Control. |
| Row-level security in the database | Not implemented. Scoping is enforced in server code and tested instead. |
| Production identity (SSO, MFA) | Not implemented; demo authentication only. |
| Encryption at rest | Not provided by PGlite on a local disk. Production deployment would need a managed database with encryption. |

See `docs/REQUIREMENTS_MAP.md` for how each official requirement maps to this code, and `docs/ASSUMPTIONS.md` for what needs confirming.

## Project layout

```
src/app/                 routes (App Router): login, (app) shell and all modules, API routes, server actions
src/app/actions.ts       every write, behind one session check and error handler
src/server/db/           PGlite client, versioned migrations, demonstration seed
src/server/services/     business logic: workflow, EVC, compliance, monitoring, reports, admin
src/server/permissions.ts  roles, permission table, record-scope rules
src/server/audit.ts      audit log and notification helpers (used inside each transaction)
src/components/          shell, forms with confirmation dialogs, shared UI, charts
tests/                   Vitest (unit and integration) and Playwright walkthroughs
scripts/db.ts           migrate, seed, reset
docs/                    architecture, requirements map, assumptions, demo script, test results, progress
```

## Known limitations

- Single-process prototype. PGlite allows one writer at a time; it is not built for many concurrent users.
- Files are stored inside the database (bytea), not in a separate private file store.
- Each account has one role. Institution and regional accounts are scoped by the seed data.
- Workflow stage owners and checklists are fixed in seed data; only target durations are editable in the UI.
- Monitoring runs on demand. A scheduler would call the same function.
- Demo timings, thresholds and category names are illustrative and must be confirmed against the APH.
