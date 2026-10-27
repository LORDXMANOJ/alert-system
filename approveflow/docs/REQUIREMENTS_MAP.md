# Requirements map

How each part of the official problem statement (SIH26262) is addressed. "Where" points to the main code location.

## A. End-to-end approval workflow automation

| Requirement | Implementation | Where |
|---|---|---|
| Route applications through Only Scrutiny, Scrutiny + EVC, EVC + SAC/SHC, Only EVC and other combinations | Five configured templates; category selects the route | `db/seed.ts` (templates), `services/workflow.ts` `createApplication` |
| Automatic movement to the next stage after the preceding stage, subject to rules and authorised actions | `completeStage` advances on a valid checklist and owner role | `services/workflow.ts` `completeStage` |
| Authorised return or revert with reasons | `returnForClarification` (reason ≥ 10 characters); the institution's response resumes the stage | `services/workflow.ts` |
| Standardised communications and case summaries | In-app notifications on each transition; the detail page's summary and timeline | `services/workflow.ts`, `notifyRole` |

## B. Integrated dashboard and pendency monitoring

| Requirement | Implementation | Where |
|---|---|---|
| Consolidated status across regions, stages, institutions and officers | Overview dashboards, applications register with filters, workflow management pipeline | `(app)/page.tsx`, `(app)/applications`, `(app)/workflow` |
| Ageing, timelines, workload, pending cases and bottlenecks | Ageing buckets, workload by role, stage pendency with overdue counts | `services/reports.ts` |
| Alerts for applications approaching or exceeding timelines | `R-STAGE` rule (thresholds 3, 1, 0 days, then overdue) | `services/monitoring.ts` |
| Role-based dashboards | One overview per role; navigation filtered by role | `(app)/page.tsx`, `lib/nav.ts` |
| Complete digital audit trail | Append-only `audit_logs` and `application_events` | `db/migrations.ts` triggers, `audit.ts` |

## C. EVC scheduling and alerts

| Requirement | Implementation | Where |
|---|---|---|
| Identify EVC applications and place them in the queue after preliminary processing | An EVC record is created when the application reaches an EVC stage; the stage cannot close until the visit is recorded | `services/workflow.ts`, `services/evc.ts` |
| Track scheduling and completion, particularly for new institutions | Status board and list show a "New institution" tag; the dashboard counts new institutions awaiting a visit | `(app)/evc/page.tsx` |
| Reminders for EVCs due, and escalation of delayed cases | `R-EVC` rule (14, 7, 1, 0 days); escalation ladder | `services/monitoring.ts` |
| Calendar and list views; calendar entries open the application's EVC history | Month calendar and list views link to `?tab=evc` | `(app)/evc/page.tsx` |

## D. Time-bound undertakings and institutional compliance

| Requirement | Implementation | Where |
|---|---|---|
| Record of conditions, evidence and due dates | Undertakings with condition, evidence required, issued and due dates | `services/compliance.ts` |
| Notify institutions before deadlines; online submission | `R-UT` rule (30, 15, 7, 0 days); evidence form for the institution | `services/monitoring.ts`, `(app)/undertakings/[id]` |
| Track submission and verification by officials | Submission versions and reviewer outcome | `services/compliance.ts` |
| Reminders and escalation for unfulfilled undertakings | Overdue alert and escalation ladder | `services/monitoring.ts` |
| Submission never counts as verification; resubmission after corrections | Status changes to verified only on reviewer acceptance; corrections create a new version | `reviewUndertakingSubmission` |

## E. Lease and document validity

| Requirement | Implementation | Where |
|---|---|---|
| Track validity and expiry dates | Document versions carry expiry dates; validity is computed from the accepted version and the clock | `services/compliance.ts` `documentValidity` |
| Advance alerts for approaching expiry | `R-DOC` rule (30, 15, 7, 0 days) | `services/monitoring.ts` |
| Monitor submission and verification of renewals | Renewal creates a pending version; reviewer accepts or returns | `uploadRenewal`, `reviewDocumentVersion` |
| Overdue alerts and escalation for expired or missing renewals | Overdue alert after expiry while no renewal is pending | `services/monitoring.ts` |
| Historical documents are not overwritten | Versions are inserted, never updated; the history page shows every version | `db/migrations.ts` (`document_versions`), `(app)/documents/[id]` |

## F. Notifications, escalation and reporting

| Requirement | Implementation | Where |
|---|---|---|
| Configurable notifications for pending items, deadlines, EVC, compliance and expiry | Rules with thresholds and enable switches; notifications created with each alert | `(app)/admin/settings`, `services/monitoring.ts` |
| Automatic escalation to designated officials | Regional supervisor, then designated administrative authority | `ESCALATION_LADDER` in `services/monitoring.ts` |
| Consolidated reports | Nine report types with filters and CSV export | `services/reports.ts`, `(app)/reports` |
| Audit trail of alerts, submissions, verification, escalations and closure | Audit entries for every alert action, escalation and review | `services/monitoring.ts`, `services/compliance.ts` |

## Key requirements

| Requirement | Implementation |
|---|---|
| Single integrated platform | One application covering approvals, EVC, compliance, documents, alerts and reports |
| Configurable rules and timelines | Alert rules and stage durations are editable in System settings and Workflow configuration |
| Secure storage, role-based access, confidentiality, traceable actions | Server-side permissions, scoping, authorized downloads, audit trail |
| Integration with AICTE systems | **Not implemented.** Documented as a limitation; no unauthorized integration is attempted |
| Human oversight for decisions | Decisions require the competent authority role and an explicit confirmation; automation never decides |

## Prototype and evaluation criteria

| Criterion | Evidence |
|---|---|
| Workflow accuracy | Unit tests for transitions, skipping, owner checks, EVC gating (`tests/workflow.test.ts`) |
| Timeliness of alerts | Boundary tests at 0, 1, 7, 8, 15, 16, 30, 31 days and overdue (`tests/monitoring.test.ts`) |
| Reliability of deadline tracking | Re-runs create no duplicates; cleared conditions resolve; clock shift test (`tests/monitoring.test.ts`) |
| Visibility of pending cases | Overview, queues, pendency report and chart |
| Reduction in manual follow-up | Monitoring runs once and notifies responsible roles; escalations are automatic |
| Completeness of the audit trail | Audit entries tested for application creation, role change, exports and refusal to update audit rows |

## Regulatory safeguard

Automated alerts, recommendations and workflow actions support the process. The application never approves, rejects, verifies or closes a case. The final decision is recorded only by the competent authority role, with a stated reason.
