# Progress

Status as of 27 October 2026.

## Phases

- [x] **1. Foundation:** Next.js app, design tokens from the brief, application shell (collapsible sidebar, mobile drawer, top bar, Ctrl+K menu), PGlite database with versioned migrations, demo sign-in, permissions and audit helpers, demo clock, seed data.
- [x] **2. Workflow:** application register (search, filters, sort, pagination), new application form, detail page with stepper and timeline, five workflow templates, stage completion with checklist, return and response, final decision, assignee, workflow management pipeline, scrutiny and re-scrutiny queues.
- [x] **3. EVC:** queue board, month calendar, list view, scheduling, visit recording, report pending.
- [x] **4. Compliance:** undertakings (record, evidence versions, review, resubmission), document register (upload, renewal, review, version history), compliance queue.
- [x] **5. Automation:** monitoring engine (five rules, deduplication, auto-clear, escalation ladder), alerts centre (acknowledge, resolve), notifications centre, Demo Control (clock shift, reset).
- [x] **6. Insight:** role overviews with charts, nine reports with filters and CSV export, print view, audit trail with filters, users and roles, workflow configuration, system settings.
- [x] **7. Quality:** Vitest suites (59 tests), Playwright walkthroughs for scenarios A to E and a mobile check, screenshots, typecheck, lint, production build, documentation.

## Open items (not built)

- [ ] Email and SMS providers (shown as "not configured")
- [ ] AICTE system adapters (none connected; no credentials exist)
- [ ] Background scheduler (checks run on demand)
- [ ] Missing-document and discrepancy fields as first-class data (covered today by checklist items)
- [ ] Row-level security policies in the database
- [ ] Production identity provider and encryption at rest
- [ ] Per-user role assignment table (one role per user today)
- [ ] Hindi and other language support
- [ ] Presentation deck (see `presentation/`)

## Next session

Start from `docs/TEST_RESULTS.md` to see the last verified state. To continue development, run the verification commands in the README first.
