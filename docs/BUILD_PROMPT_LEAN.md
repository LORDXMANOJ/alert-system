# BUILD PROMPT (lean) — ApproveFlow AICTE, SIH26262

> Paste everything below the line into Claude Code, opened in this project folder.
> Model checkpoints are marked **[MODEL]**. At each one, Claude stops and asks you to type the `/model` command shown. Claude cannot change its own model.

---

Build **ApproveFlow AICTE — Approval & Compliance Command Centre**, a working prototype for SIH 2026 problem **SIH26262**. The official text is in `docs/PROBLEM_STATEMENT.md`. It is the source of truth.

## Rules (keep these in mind all the time)

1. **Fictional data only.** Don't invent official AICTE deadlines, document lists, criteria, designations, IDs, APIs or statistics. Unknown values become settings labelled "Illustrative — configurable".
2. **Humans decide.** Automation routes, reminds, and escalates. It never approves, rejects, verifies or closes a case.
3. **No AICTE branding or logo.** Footer on every page: "SIH 2026 prototype · Not an official AICTE system · Fictional data."
4. **Only claim what runs.** Don't say a feature, test, email or integration works unless you built it and ran it this session. Report real test output.
5. **Save tokens.**
   - Read a file only when you need it. Don't re-read files you just wrote.
   - Keep logs short. Show only failures in full.
   - Track progress in `docs/PROGRESS.md`, so a new session can resume without re-exploring.
   - Use the `haiku-helper` subagent for search, renames, log reads and one-line edits, if it is set up.
6. **Git.** Commit as the existing git user (LORDXMANOJ). **Never** add Co-Authored-By, "Generated with" or any AI attribution. Commit at the end of each phase. Don't push.
7. **Ask before big moves.** If something needs a decision that changes scope, ask one short question. Don't guess.

## Stack (fixed)

- **Next.js** (App Router, latest stable), **React**, **TypeScript strict**.
- **Tailwind CSS**, **shadcn/ui**, **Lucide** icons, **sonner** toasts, **cmdk** command menu, **motion** (Framer Motion).
- **TanStack Table** for tables. **Recharts** for charts. **nuqs** for URL state (filters and tabs in the URL).
- **PGlite** (Postgres in WASM, persisted to `./data/pglite`) with **Drizzle ORM** and drizzle-kit migrations.
- **Zod** for validation (shared by forms and server). **React Hook Form** for forms.
- Files stored under `./storage`, served only through an authorization-checked route. PDF/PNG/JPG only, 10 MB max, check magic bytes.
- Tests: **Vitest** (unit and integration on a fresh in-memory PGlite) and **Playwright** (E2E and screenshots).

**Architecture:** business logic lives in `src/server/services/*` as plain functions `(db, actor, input)`. Every write checks permission and writes the audit log in the same transaction. UI and server actions stay thin.

**Scripts to provide:** `dev`, `build`, `start`, `typecheck`, `lint`, `db:migrate`, `db:seed`, `db:reset`, `test`, `test:e2e`, `screenshots`.

A judge runs `npm install && npm run db:reset && npm run dev`. Nothing else.

## Skills to use (load each one before its area)

| Area | Skills |
|---|---|
| Overall look, layout, shell | `impeccable`, `ui-design`, `design-taste-frontend` |
| Components and tables | `shadcn`, `react-hook-form`, `zod` |
| Motion | `animate`, `emil-design-eng`, `framer-motion`, `reduced motion` rules from `apple-design` |
| Navigation, command menu, URL state | `nuqs`, `nextjs` |
| Database and migrations | `drizzle-orm`, `supabase-postgres-best-practices` (schema, constraints, RLS-style scoping) |
| Workflow and automation logic | `typescript`, `vitest` |
| Charts | `dataviz` |
| Security review | `security-and-hardening` |
| Browser checks and screenshots | `webapp-testing`, `ui-verification` |
| Deck | `pptx` |
| Commit and wrap-up | `verification-before-completion` |

## The palette (fixed core tokens)

```css
:root {
  --primary-navy: #0F172A;     /* sidebar, header accents, high-emphasis text */
  --action-cobalt: #1D4ED8;    /* primary buttons, active nav, progress, workflow triggers */
  --action-cobalt-hover: #2563EB;
  --bg-slate: #F8FAFC;         /* page background, table headers */
  --warning-amber: #D97706;    /* pendency, expiry 30/15/7 days, pending EVC */
  --critical-crimson: #DC2626; /* overdue, rejected, escalated, discrepancy */
}
```

- Supporting: card `#FFFFFF`, border `#E2E8F0`, muted text `#64748B`, body `#334155`, success `#15803D`.
- **Contrast:** amber as text is too faint on white. Use `#B45309` for amber text and `#D97706` for fills, icons and borders.
- Status colours always come with an icon or label.
- Map these to shadcn's CSS variables.

## Design, navigation and motion (top priority)

- **Feel:** calm, dense, trustworthy, in the spirit of GOV.UK or Stripe Dashboard. No gradients on surfaces, no glass effects, no emoji, no hero banners inside the app.
- **Shell:** collapsible navy sidebar grouped as Work / Monitoring / Administration. Live count badges. A sliding active indicator. Icon-only mode with tooltips. Top bar with clickable breadcrumbs, global search, notification bell, role badge and user menu. Mobile uses a sheet menu, and tables become cards.
- **Navigation rules:** any record is 2 clicks from Overview. ⌘K / Ctrl+K command menu. Shortcuts `g a` (Applications), `g e` (EVC), `/` (search). Alerts and KPIs link to the filtered list behind them. Filters and tabs live in the URL, so back works.
- **Motion:** 150–250 ms, only `transform` and `opacity`. Route content fades and rises 4 px. Tab and sidebar indicators glide. KPI numbers count up once. Stage stepper: the current stage pulses softly and completed stages fill. Lists stagger 20–30 ms per row, capped at 8 rows. Charts animate once. Everything can be interrupted. Under `prefers-reduced-motion`, changes are instant or a plain fade.
- **Screenshots:** after each UI phase, capture desktop 1440×900 and mobile 390×844 of the main screens. Check them and fix spacing, contrast and overflow before moving on.

## Domain (keep it normalized, keep history append-only)

- **Organization:** regions, institutions, users, roles, user_roles (role scoped to a region or institution).
- **Workflow:** workflow_templates, workflow_stages (order, responsible role, target days, `is_evc`, `is_committee`, checklist), workflow_transitions (type advance / return / decision, `requires_reason`). Templates are versioned, so edits never rewrite running cases.
- **Applications:** applications, application_events (append-only), scrutiny_records.
- **EVC:** evc_records (status, target date, scheduled date, completed date, coordinator, notes).
- **Compliance:** undertakings (condition, dates, evidence required, status), compliance_submissions (versioned, with review outcome).
- **Documents:** document_categories (configurable), documents (logical), document_versions (file, issue and expiry dates, submission and verification status, reviewer). A renewal is a new version linked to the previous one. Never overwrite.
- **Automation:** alert_rules (thresholds, e.g. 30/15/7/0 days; overdue condition; severity; responsible role; escalation delay; enabled), alerts (**unique on rule + entity + threshold**), escalation_events (**unique per alert + level**), notifications.
- **Governance:** audit_logs (actor, role, action, entity, timestamp, JSON diff, reason). A database trigger blocks UPDATE and DELETE on it. system_settings holds the **demo clock offset**.
- **Demo clock:** all date maths uses `now()` from `src/server/clock.ts`, which adds the stored offset. Seed dates are relative to today.

## Workflow engine

Templates to seed (stages, roles and durations are illustrative and editable):
Only Scrutiny · Scrutiny + EVC · EVC + SAC/SHC · Only EVC · Scrutiny → Re-scrutiny → EVC → SAC/SHC.

- Submit → pick template by category → stage 1 with assignee and due date.
- Completing a stage checks the checklist and permission, then advances. When the next stage is an EVC stage, create an EVC record in "Awaiting Scheduling".
- Return requires a reason. Status becomes "Clarification Requested", and the institution is notified.
- Only the Competent Authority can record a final decision. It is never automatic.
- Reject with clear errors: invalid transitions, skipped mandatory stages, missing reasons, unauthorized actors.
- Every transition writes events and audit rows in one transaction.

## Modules

- **Overview:** role-specific (see Roles).
- **Applications:** register with search, filters (region, stage, status, workflow, overdue), sorting, pagination, CSV export. Detail page has a stage stepper, SLA badge, and tabs: Summary · Timeline · Scrutiny · EVC · Undertakings · Documents · Alerts · Audit. Action bar: Complete / Return / Decide, each behind a confirm dialog.
- **Scrutiny & Re-scrutiny:** queue plus split-view workspace with checklist, observations, discrepancy flags, missing-document indicators, clarification requests. Filled-in fields never mean "compliant".
- **EVC Scheduling:** status board (Awaiting → In Progress → Scheduled → Report Pending → Follow-up → Closed), month calendar and list view. Clicking an entry opens the application's EVC tab.
- **Undertakings:** condition, due date, evidence required, timeline. Institution uploads evidence. Reviewer accepts or requests corrections. Resubmission creates a new version. An institution's submission never counts as verification.
- **Lease & Document Validity:** register with colour-coded status (Valid / ≤30 d / ≤7 d / Expired / Renewal under review) and a validity bar. Version history keeps old versions visible. A renewal isn't valid until a reviewer accepts it.
- **Alerts & Escalations:** "Run monitoring checks" button with a summary (new, escalated, duplicates skipped). Alerts go open → acknowledged → resolved, with history. Alerts resolve automatically when the condition clears.
- **Notifications:** bell plus full page, read/unread, mark all read, filters, deep links.
- **Reports:** pendency by stage and region, ageing buckets (0–15 / 16–30 / 31–60 / 60+), workload by officer, bottlenecks, EVC status, undertaking compliance, document expiry, overdue cases, escalation log. Filters for date, region, stage, institution, status. Accurate totals. Authorized, audited CSV export. Print stylesheet.
- **Audit Trail:** filterable, read-only, with a JSON diff viewer.
- **Admin:** Users & Roles (no self-role-change), Workflow Configuration (drag-to-reorder stages with a live stepper preview), Alert Rules, Integrations (labelled SIMULATED mock adapters; a failed sync never changes state), Settings and Demo Control (shift clock, run checks, reset data).

## Roles and security

Demo roles (proposed, not official): Administrator · Institution User · Regional Officer · Bureau Officer · EVC Coordinator · Committee Reviewer · Competent Authority · Auditor (read-only).

- Login page with one-click role cards, labelled "Demo authentication". Signed httpOnly cookie.
- Permission checks on every server action and route. Scope every query to region or institution. Downloads checked on every request.
- Tests call the services directly as unauthorized actors.

## Monitoring engine

`runMonitoringChecks(db, now)`: stage SLA, scrutiny pendency, EVC deadlines, undertaking due dates, submissions awaiting review, document expiry thresholds, expired documents with no accepted renewal.

- **Idempotent:** `INSERT … ON CONFLICT DO NOTHING`.
- Escalation path: assignee → team lead → supervisory role → designated authority. Each level fires once.
- Creates notifications and audit rows. Returns a summary.
- Email and SMS show as "not configured". Never claim they work.

## Seed data

About 5 regions, 25 fictional institutions, 60 applications across all templates and stages (including closed ones), 15 undertakings across statuses, 30 document versions (valid, expiring at 28/14/6 days, expiring today, expired, renewal under review, renewal accepted with old version kept), and existing alerts, escalations and audit history. Mark the hero records used in the demo in `docs/DEMO_SCRIPT.md`.

## Judge walkthroughs (must work in the UI and in Playwright)

- **A. Workflow:** Bureau Officer completes scrutiny on a Scrutiny + EVC application → it enters the EVC queue → EVC Coordinator schedules and completes the visit → advance → check timeline.
- **B. Undertaking:** Institution uploads evidence → Reviewer requests corrections → institution resubmits → Reviewer accepts → check history.
- **C. Lease expiry:** open a lease expiring in 6 days → alert shows → upload renewal → reviewer accepts → old version still visible → alert resolves.
- **D. Escalation:** run checks → shift clock +10 days → run checks (escalations appear) → run again (**0 new, all duplicates skipped**) → check escalation history.
- **E. Reporting:** regional pendency → filter by stage and status → overdue report → export CSV → audit trail shows A–D.

## Tests

- **Vitest:** template selection; valid and invalid transitions; return needs a reason; EVC queue entry only after preliminary stages; deadline maths at today, tomorrow, exactly at threshold, and threshold ±1 day; alert dedupe (run twice, same count); escalation idempotency; institution scoping; role permissions; download and CSV authorization; audit rows written and not updatable; document versions preserved.
- **Playwright:** walkthroughs A–E.
- Run `typecheck`, `lint`, `test`, `build`, `test:e2e`. Record the actual results in `docs/TEST_RESULTS.md`. Fix failures before claiming done.

## Phases and model checkpoints

Before each phase, Claude says: **[MODEL] Type `/model <name>`, then reply "continue".** Claude then waits.

| # | Phase | Model | Work |
|---|---|---|---|
| 1 | Foundation: scaffold, tokens, shell, schema, demo auth, `authorize`/`audit`, clock, seed | **opus** | Architecture decisions |
| 2 | Workflow: register, detail page, templates, engine, timeline | **opus** | Core routing logic |
| 3 | EVC: queue, board, calendar, actions | **sonnet** | UI-heavy |
| 4 | Compliance: undertakings, submissions, documents, versions | **sonnet** | Mostly CRUD and UI |
| 5 | Automation: rules, monitoring engine, alerts, escalation, notifications, Demo Control | **opus** | Idempotency and rules |
| 6 | Insight: role dashboards, reports, CSV, audit trail, admin screens | **sonnet** | Layout and charts |
| 7 | Quality: tests, walkthroughs, responsive polish, screenshots | **sonnet** for fixes; **haiku** for running commands and collecting results | |
| 8 | Presentation: deck and deliverables | **sonnet** | Writing and layout |

Commit at the end of each phase and update `docs/PROGRESS.md` with what's done and what's next.

## Deliverables

```
README.md                    quick start, scripts, demo logins, feature matrix (Implemented / Simulated / Not implemented)
.env.example                 placeholders only
docs/ARCHITECTURE.md         stack, module map, data model (Mermaid), security model, monitoring engine
docs/REQUIREMENTS_MAP.md     each official requirement → where it's implemented
docs/ASSUMPTIONS.md          items to confirm against the APH and AICTE procedures
docs/DEMO_SCRIPT.md          5-minute judge script with hero records
docs/TEST_RESULTS.md         actual results of the last test, typecheck and build runs
docs/PROGRESS.md             phase checklist
presentation/screenshots/    main screens, desktop and mobile
presentation/ApproveFlow_SIH26262.pptx   about 16 slides, built with the palette and real screenshots
presentation/deck-outline.md slide content and speaker notes
```

Start with Phase 1. Write `docs/PROGRESS.md`, then show the **[MODEL]** checkpoint for phase 1 before any code.
