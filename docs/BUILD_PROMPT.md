# BUILD PROMPT — ApproveFlow AICTE (SIH26262)

> Paste everything below this line into Claude Code, opened in the project folder.

---

You are building **ApproveFlow AICTE — Approval & Compliance Command Centre**, a working prototype for Smart India Hackathon 2026 problem statement **SIH26262** (AICTE · Software · Smart Automation). The full official statement is in `docs/PROBLEM_STATEMENT.md`. Treat it as the source of truth. If this prompt and that file disagree, the file wins.

Build a working product, not a mock-up: database, business rules, permissions, automation, reports, tests, and a demo judges can run themselves. **UI/UX quality is the top judging priority after correctness.** It must look like a serious government-enterprise tool built by a professional product team.

## 0. Ground rules

1. **Don't invent official facts.** That means AICTE deadlines, mandatory document lists, approval criteria, officer designations, institution IDs, APIs or statistics. If the statement doesn't give a value, make it a setting and label the default *"Illustrative — configurable"*.
2. **Humans decide.** Automation routes work, updates status, reminds and escalates. It never approves, rejects, verifies or closes a case on its own. An overdue item gets escalated, never auto-decided.
3. **No impersonation.** Don't use the AICTE logo, the national emblem or any official branding. Show a small persistent footer label: *"SIH 2026 prototype · Not an official AICTE system · All data is fictional."*
4. **Say only what's true.** Don't claim a feature, test, integration, email or SMS works unless it's built and has been run. Don't report tests as passing unless you ran them in this session.
5. **Keep the token budget small.**
   - Work phase by phase (section 9).
   - Read only the files you need, and don't re-read files you just wrote.
   - Don't spawn subagents unless I ask.
   - Use `docs/PROGRESS.md` to track progress, so a new session can resume without re-exploring the repo.

## 1. Environment and git

- OS: **Windows 11**. Shells: PowerShell and Git Bash. Node 24, npm 11. No Docker. Everything must run locally with `npm` only.
- The project folder already has its own git repo, with git user `LORDXMANOJ <manoj.nive2007@gmail.com>`.
- **Commit as me.** Use the existing git identity. **Never** add `Co-Authored-By`, "Generated with Claude" or any AI attribution to commits, PRs or code.
- Commit at the end of each phase with a clear conventional message, e.g. `feat(evc): scheduling queue and calendar`. Never force-push. Never push unless I say a remote is linked and ask you to push.
- `.gitignore` must cover `node_modules`, `.next`, local database files (`/data`), uploads (`/storage`), `.env*` (except `.env.example`), Playwright reports and test results.

## 2. Stack (fixed. Don't re-debate it.)

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (latest stable), App Router, React, **TypeScript strict** | Server Components plus Server Actions keep logic on the server |
| UI | Tailwind CSS, **shadcn/ui** (Radix), Lucide icons, `sonner` toasts, `cmdk` command menu | Accessible, professional primitives |
| Tables | TanStack Table | Sorting, filtering, pagination, column visibility |
| Charts | Recharts | Pendency, ageing and workload analytics |
| Database | **PGlite** (real Postgres in WASM), persisted to `./data/pglite` | Zero install for judges. Real SQL, constraints and triggers |
| ORM / migrations | **Drizzle ORM** plus drizzle-kit | Typed schema and versioned SQL migrations. Can move to Supabase or Postgres later by swapping the driver |
| Validation | Zod (shared by forms and server), React Hook Form | One schema for client and server |
| Files | Local `./storage`, served only through an authorization-checked route handler | Private documents |
| Tests | Vitest (unit and integration against a fresh in-memory PGlite), Playwright (E2E and screenshots) | |

Architecture rule: all business logic lives in `src/server/services/*` as plain, testable functions that take `(db, actor, input)`. UI components and Server Actions are thin wrappers. Every write goes through `authorize(actor, permission, record)` and `audit(...)` **inside the same transaction**.

Required npm scripts:
- `dev`, `build`, `start`
- `typecheck`, `lint`
- `db:migrate`, `db:seed`, `db:reset` (drop, migrate and seed)
- `test` (Vitest), `test:e2e` (Playwright)
- `screenshots` (Playwright script that saves every main screen to `presentation/screenshots/`)

A judge must be able to run `npm install && npm run db:reset && npm run dev` and use the app. No manual database edits.

## 3. Domain model

Use normalized tables with foreign keys, unique constraints, indexes, and `created_at`/`updated_at`. Adapt the list if needed, but keep history append-only.

- **Organization:** `regions`, `institutions`, `users`, `roles`, `user_roles` (a user can hold a role scoped to a region or an institution).
- **Workflow config:** `workflow_templates`, `workflow_stages` (order, responsible role, target duration in days, `is_evc`, `is_committee`, completion checklist), `workflow_transitions` (from, to, type: `advance` | `return` | `decision`, `requires_reason`).
- **Applications:** `applications` (current stage, status, priority, region, assignee, stage-entered-at, due-at), `application_events` (every transition, append-only), `scrutiny_records` (checklist results, observations, discrepancies, outcome).
- **EVC:** `evc_records` (status, target date, scheduled date, completed date, coordinator, notes), with history in `application_events`.
- **Compliance:** `undertakings` (condition, issue date, due date, evidence requirements, status), `compliance_submissions` (versioned, with review outcome and remarks).
- **Documents:** `document_categories` (configurable), `documents` (the logical document, e.g. "Lease deed – Campus A"), `document_versions` (file, issue date, expiry date, submission status, verification status). Never overwrite. A renewal is a new version that links to the previous one.
- **Automation:** `alert_rules` (record type, thresholds such as `[30,15,7,0]` days, overdue condition, severity, responsible role, escalation delay, enabled), `alerts` (**unique on `(rule_id, entity_type, entity_id, threshold_key)`** for deduplication), `escalation_events` (unique per alert and level), `notifications` (per user, read/unread, link).
- **Governance:** `audit_logs` (actor, role, action, entity, entity id, timestamp, JSON diff, reason). Protect it with a Postgres trigger that blocks `UPDATE` and `DELETE`. `system_settings` holds the **demo clock offset** and default thresholds.

**Demo clock:** every date calculation uses `now()` from `src/server/clock.ts`, which adds the stored offset. Seed data uses dates relative to "today", so the demo works on any day. An admin-only **Demo Control** panel can (a) shift the clock forward by N days, (b) run monitoring checks, and (c) reset demo data.

## 4. Workflow engine (most important logic)

Seed templates for the routes named in the statement. Their stage lists, roles and durations are illustrative and editable in the UI:
- **Only Scrutiny**
- **Scrutiny + EVC**
- **EVC + SAC/SHC**
- **Only EVC**
- **Scrutiny → Re-scrutiny → EVC → SAC/SHC**, to show a longer "other combination"

Behaviour:
1. On submit, select a template by application category and place the application in stage 1. Set the assignee and due date from the stage's target duration.
2. `completeStage()` checks the checklist and the user's permission, then moves to the next configured stage. When the next stage has `is_evc`, it **automatically creates an `evc_record` in the "Awaiting Scheduling" queue**.
3. `returnApplication()` requires a reason. It sets status to "Clarification Requested", notifies the institution, and resumes at the configured stage after the institution responds.
4. `recordDecision()` is allowed only for the Competent Authority role at the final stage, and is never automatic.
5. The engine **rejects** these with clear errors: invalid transitions, skipped mandatory stages, missing reasons, and unauthorized actors. Every transition writes `application_events` and `audit_logs` in one transaction.
6. Admins can edit templates in **Workflow Configuration**: stages, order, roles, durations and transitions. Use a drag-to-reorder stage list with a live preview stepper. Templates in use are versioned, so editing one never changes the history of running applications.

## 5. Modules and screens

Every navigation item must be functional and backed by data. Group the sidebar as follows.

**Work**
- **Overview:** a role-specific dashboard (section 6).
- **Applications:** a register with search, filters (region, stage, status, workflow, overdue), sorting, pagination, saved views and CSV export. Clicking a row opens the **Application detail** page:
  - A header with the stage stepper and an SLA badge.
  - Tabs: Summary · Timeline (all events) · Scrutiny · EVC · Undertakings · Documents · Alerts · Audit.
  - A context-aware action bar: Complete stage / Return / Record decision, each behind a confirm dialog.
- **Scrutiny & Re-scrutiny:** my queue plus the re-scrutiny queue, with a split view (list on the left, review workspace on the right). The workspace shows a configured checklist, observations, discrepancy flags, missing-document indicators and a clarification request. The system never marks something "compliant" just because fields are filled in.
- **EVC Scheduling:** a status board (Awaiting Scheduling → Scheduling In Progress → Scheduled → Report Pending → Follow-up Required → Closed), a **month calendar** and a list view. Clicking an entry opens the application's EVC tab. Highlight new institutions.
- **Undertakings:** each record shows the condition, due date, evidence required and a status timeline. Institutions submit evidence (file upload plus a note), and a reviewer accepts it or asks for corrections. Resubmission creates a new version. An institution's own submission never counts as verification.
- **Lease & Document Validity:** an expiry register with colour-coded validity (Valid / Expiring ≤30d / Expiring ≤7d / Expired / Renewal under review). A renewal uploads a new version, and the old version stays visible in a version-history panel. A renewal isn't "valid" until a reviewer accepts it.

**Monitoring**
- **Alerts & Escalations:** open, acknowledged, escalated and resolved alerts. A **Run monitoring checks** button shows a result summary such as "3 new alerts, 1 escalation, 12 skipped as duplicates". Each alert has an acknowledge → resolve lifecycle with history. An alert resolves automatically when its condition clears, e.g. when a renewal is accepted.
- **Notifications:** the bell in the top bar plus a full page, with read/unread, mark all read, filters and deep links.
- **Reports:** pendency by stage and region, an ageing buckets chart (0–15 / 16–30 / 31–60 / 60+ days), workload by officer, bottleneck stages, EVC status, undertaking compliance, document expiry, overdue cases, and an escalation log. Each report has date, region, stage, institution and status filters, accurate totals, **CSV export** (authorization-checked and audited) and a print stylesheet.
- **Audit Trail:** a filterable, read-only log with a JSON diff viewer.

**Administration**
- **Users & Roles:** assign roles with a scope. Users can't change their own roles.
- **Workflow Configuration** (see section 4).
- **Alert Rules:** thresholds, severity, escalation delay, enable/disable. Label every default "Illustrative — configurable".
- **Integrations:** adapter interfaces with clearly labelled **mock** adapters (e.g. "AICTE portal sync – SIMULATED"). Log every sync attempt. A failed sync never changes application state.
- **Settings and Demo Control.**

## 6. Roles and security

Demo roles (proposed, not official designations):
- Administrator
- Institution User (scoped to one institution)
- Regional Officer (scoped to a region)
- Bureau Officer
- EVC Coordinator
- Committee Reviewer
- Competent Authority
- Auditor (read-only)

Each role gets its own **Overview**:
- **Institution:** my applications, clarification requests, upcoming undertaking and document deadlines.
- **Regional Officer:** regional pendency and overdue applications.
- **Bureau Officer / Committee Reviewer:** my queue and SLA status.
- **EVC Coordinator:** queue counts, this week's visits, delayed cases.
- **Competent Authority:** cases awaiting a decision.
- **Admin / Auditor:** a national-view command centre.

Authentication uses a **demo login page with role cards** (one click per fictional user), labelled "Demo authentication". It sets a signed, httpOnly session cookie. Enforce everything **on the server**:
- Permission checks on every action and route handler.
- Record scoping in every query (an institution user can't fetch another institution's application by guessing its ID).
- Authorization-checked file downloads.
- Upload limits: 10 MB, PDF/PNG/JPG only, with checks on the file's magic bytes and not just its extension.

Write tests that call services directly as unauthorized actors.

## 7. Monitoring engine

`runMonitoringChecks(db, now)` is a single pure-ish service that covers:
- Stage SLA (approaching and overdue).
- Scrutiny pendency.
- EVC scheduling deadlines and upcoming visits.
- Undertaking due dates.
- Submissions awaiting review.
- Document expiry thresholds, and overdue documents with no accepted renewal.

It must:
- Be **idempotent**, using `INSERT … ON CONFLICT DO NOTHING` on the unique keys.
- Escalate along a configured path (assignee → team lead role → supervisory role → designated authority) once each escalation delay passes. Each level fires only once.
- Create notifications for the responsible users.
- Write audit entries.
- Return a summary.

Trigger it from the UI button and from Demo Control. An optional interval runner in dev mode reuses the same function. Don't claim email or SMS. Show those as "not configured" placeholders.

## 8. Design system (top priority; spend real effort here)

Before writing UI code, load the **`impeccable`** skill, or `ui-ux-pro-max` / `frontend-design` if it isn't available. Use it to set the design direction and tokens, then follow it. Use the **`shadcn`** skill for components and **`dataviz`** for charts.

- **Feel:** calm, dense, trustworthy. It should feel like Linear, Stripe Dashboard or GOV.UK, not a marketing site. No gradients on surfaces, no glassmorphism, no emoji, no "AI sparkle" decoration, and no hero sections inside the app.
- **Colour palette (fixed: use exactly these as the core tokens):**

  ```css
  :root {
    --primary-navy: #0F172A;      /* sidebar bg, top-header accents, high-emphasis text, dark-mode base */
    --action-cobalt: #1D4ED8;     /* primary buttons, active nav, progress bars, workflow triggers */
    --action-cobalt-hover: #2563EB;
    --bg-slate: #F8FAFC;          /* page background, table headers, neutral canvas */
    --warning-amber: #D97706;     /* pendency, approaching expiry (30/15/7d), pending EVC visits */
    --critical-crimson: #DC2626;  /* overdue, rejections, escalations, discrepancy flags */
  }
  ```

  - Fill in the supporting tokens from the Tailwind slate scale: card `#FFFFFF`, border `#E2E8F0`, muted text `#64748B`, body text `#334155`. Add a success green (`#15803D`) for completed stages and accepted documents.
  - **Contrast rule:** `#D97706` amber fails WCAG AA as small text on white. Use it for fills, icons, borders and badge backgrounds (`amber-50` background with `#B45309` text). Use `#B45309` wherever amber is text. Crimson and cobalt pass as text on white.
  - Map these to shadcn's CSS variables (`--primary`, `--destructive`, etc.) so every component inherits them.
  - Use status colours only for meaning, always paired with an icon or label (never colour alone).
  - The dark theme uses `--primary-navy` as its base.
- **Type:** Inter or IBM Plex Sans for UI, with tabular numerals for all numbers, dates and IDs. Use a clear scale (12/13/14/16/20/24/30). Use a monospace font for record IDs.
- **Signature components** (build them once and reuse them):
  - `StageStepper`: a horizontal stepper that marks completed, current, returned and pending stages.
  - `SlaBadge`: on track / due in N days / overdue by N days.
  - `StatusChip`
  - `ValidityBar`: document validity remaining, shown as a thin bar.
  - `KpiCard`: number, delta vs. last period (only if computed from real data) and a sparkline.
  - `Timeline`: actor avatar, action, reason, time.
  - `EmptyState`: icon, sentence and primary action.
  - `ConfirmDialog`: states the consequence and requires a reason where configured.
- **Shell:**
  - A collapsible sidebar with grouped navigation and count badges (e.g. "EVC 7").
  - A top bar with breadcrumbs, global search (⌘K command menu that searches applications, institutions and pages), the notification bell, a role badge and a user menu.
  - The fictional-data footer.
  - On mobile, a sheet-based navigation, with tables turning into cards.
- **Navigation (a top priority; it must feel effortless):**
  - Every record is at most 2 clicks from the Overview.
  - The sidebar has an active-state indicator bar that slides between items, live count badges, a collapsed icon-only mode with tooltips, and remembers its state.
  - Breadcrumbs are clickable, and deep-link URLs keep their filters and tabs (use `nuqs` for URL state), so the back button always works.
  - Command menu (⌘K / Ctrl+K) with recent items, keyboard shortcuts (`g a` Applications, `g e` EVC, `/` search), and "next/previous record" arrows on detail pages.
  - Every alert, notification and KPI card links straight to the filtered list or record behind it.
- **Motion (a top priority: purposeful and calm, never decorative).** Before writing motion code, load the `animate` / `emil-design-eng` skills. Use the `motion` (Framer Motion) library.
  - Page content fades and rises 4px on route change (≈180 ms, ease-out).
  - The sidebar indicator and tab underline glide between items (shared layout animation).
  - KPI numbers count up once on first load.
  - Stage stepper: the current stage pulses softly, and a completed stage fills with a check-mark draw.
  - Lists stagger in (20–30 ms per row, capped at about 8 rows).
  - Dialogs and sheets scale or slide from their origin. Toasts slide in.
  - Charts animate in once and never on every re-render.
  - The "Run monitoring checks" button shows progress, then the result counts tick up.
  - Rules:
    - Keep motion to 150–250 ms, and animate only `transform` and `opacity`.
    - Make everything interruptible. Never block input.
    - Under `prefers-reduced-motion`, switch to instant changes or a simple fade.
- **Detail:** skeleton loaders shaped like the content, optimistic toasts, inline field errors, visible keyboard focus rings, and hover and pressed states on every interactive element. Keep page headers consistent (title, description, primary action at top right).
- **Indian context:** use INR formatting where relevant, `DD MMM YYYY` dates, IST, and Indian state and region names. Institutions are fictional (e.g. "Vindhya Institute of Technology, Bhopal").

After each UI phase, take Playwright screenshots at 1440×900 and 390×844, **look at them**, and fix spacing, alignment, contrast or overflow problems before moving on.

## 9. Phases (commit and update `docs/PROGRESS.md` after each)

1. **Foundation:** scaffold, design tokens, app shell, database schema and migrations, demo auth, the `authorize`/`audit` helpers, demo clock, seed data.
2. **Workflow:** application register and detail page, workflow templates, the engine, scrutiny workspace, timeline.
3. **EVC:** queue, board, calendar, scheduling actions.
4. **Compliance:** undertakings, submissions and review, document register, versions and renewal.
5. **Automation:** rules, the monitoring engine, alerts, escalations, notifications, Demo Control.
6. **Insight:** role dashboards, reports, CSV export, audit trail, admin screens, mock integrations.
7. **Quality:** tests, E2E walkthroughs, responsive polish, the screenshot pass, docs and the presentation folder.

Don't stop after scaffolding. Continue phase by phase until the definition of done (section 13) is met. If a session ends early, `docs/PROGRESS.md` must say exactly what's done and what's next.

## 10. Seed data (fictional, relative dates)

Include:
- 5 regions and about 25 institutions.
- About 60 applications spread across every template and stage, including:
  - Applications awaiting scrutiny, returned for clarification, in re-scrutiny, awaiting EVC scheduling, scheduled, delayed, report pending, and awaiting a decision.
  - Closed applications.
- 15 undertakings: on track, due soon, submitted and awaiting review, rejected, overdue.
- 30 documents (lease deeds and other configurable categories): valid, expiring in 28, 14 and 6 days, expiring today, expired, renewal under review, and a renewal accepted with the old version kept.
- Pre-existing alerts, escalations and audit history.

Mark each named **demo hero record** clearly in `docs/DEMO_SCRIPT.md`, so every scenario below has a ready-made starting point.

## 11. Judge walkthroughs (must all work in the real UI; also cover them in Playwright E2E)

- **A. Workflow:** As a Bureau Officer, open a "Scrutiny + EVC" application → complete scrutiny → it appears in the EVC queue → as EVC Coordinator, schedule the visit and mark it complete → advance to the next stage → check the timeline.
- **B. Undertaking:** As an Institution User, open an active undertaking → upload evidence → as a Reviewer, request corrections → the institution resubmits → the reviewer accepts → check the history.
- **C. Lease expiry:** Open a lease expiring in 6 days and show the alert → upload a renewal → the reviewer accepts it → the old version is still in the history and the alert resolves automatically.
- **D. Escalation:** Open Alerts → run checks → shift the demo clock forward 10 days → run checks (new overdue alerts and escalations) → run checks again (**0 new, all duplicates skipped**) → check the escalation history.
- **E. Reporting:** Open the regional pendency dashboard → filter by stage and status → open the overdue report → export CSV → open the audit trail and find the actions from A–D.

## 12. Tests

- **Vitest:**
  - Template selection.
  - Valid and invalid transitions.
  - Return requires a reason.
  - EVC queue entry happens only after the preliminary stages.
  - Deadline maths at **today, tomorrow, exactly at a threshold, threshold ± 1 day**.
  - Document expiry thresholds.
  - Alert deduplication (run twice, get the same count).
  - Escalation idempotency.
  - Institution scoping.
  - Role permissions, including self-role-change being blocked.
  - Download and CSV export authorization.
  - Audit rows are written and the audit table can't be updated.
  - Document versions are preserved.
- **Playwright:** scenarios A–E.
- Before declaring done, run: `typecheck`, `lint`, `test`, `build`, `test:e2e`. Report the actual results, and fix any failures before you claim completion.

## 13. Definition of done

`npm run db:reset && npm run dev` gives a working app where:
- All five walkthroughs pass in the UI and in Playwright.
- Permissions are enforced on the server.
- Alerts and escalations are persistent and deduplicated.
- History is never overwritten.
- Every navigation item is functional.
- The UI holds up at desktop and mobile widths.
- Typecheck, tests and build have been run and pass.

## 14. Deliverables

```
README.md                    quick start, scripts, demo logins, feature matrix (Implemented / Simulated / Not implemented)
.env.example                 placeholders only
docs/PROBLEM_STATEMENT.md    official text (already provided)
docs/ARCHITECTURE.md         stack, module map, data model diagram (Mermaid), security model, monitoring engine
docs/REQUIREMENTS_MAP.md     each official requirement (A–F, key requirements, evaluation criteria) → where it's implemented
docs/ASSUMPTIONS.md          everything to confirm against the APH / AICTE procedures
docs/DEMO_SCRIPT.md          5-minute judge script with hero records and role switches
docs/TEST_RESULTS.md         actual output summary of the last test, typecheck and build run
docs/PROGRESS.md             phase checklist
presentation/
  screenshots/               all main screens, desktop and mobile, named 01-overview.png …
  ApproveFlow_SIH26262.pptx  final deck (built last, see below)
  deck-outline.md            slide-by-slide content and speaker notes
```

**Presentation (last step):** use the `pptx` skill to build `presentation/ApproveFlow_SIH26262.pptx` with the app's colour tokens and real screenshots. Suggested slides:
1. Title (team placeholder)
2. Problem
3. Who it serves
4. Solution overview
5. Architecture
6. Workflow engine (stepper diagram)
7. EVC module
8. Undertakings and documents
9. Alerts and escalation (with the dedup demo)
10. Dashboards and reports
11. Security and audit
12. Regulatory safeguard (human-in-the-loop)
13. Requirements coverage table
14. Tech stack
15. Future scope (Supabase/Postgres, real AICTE integrations, email/SMS, Hindi UI)
16. Thank you

Render the deck to images, check every slide for overflow and readability, and fix any problems.

Start now. Write `docs/PROBLEM_STATEMENT.md` from the official text if it's missing, create `docs/PROGRESS.md`, and begin Phase 1.
