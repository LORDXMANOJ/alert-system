# Five-minute judge demonstration

Start from a fresh state: sign in as **Administrator**, open **System settings**, and press **Reset demo data**. Every step below uses the real interface. No database edits.

Hero records (seeded):

| Record | What it shows |
|---|---|
| APF-2026-0001 (Vindhya, Scrutiny + EVC) | Scrutiny stage, then the EVC queue |
| APF-2026-0003 (Godavari) | EVC visit overdue by about three weeks |
| APF-2026-0004 (Himalaya, new institution) | Visit scheduled for two days' time |
| APF-2026-0011 (Vindhya, full route) | Final decision by the competent authority |
| UT-0002 (Vindhya) | Active undertaking with evidence to submit |
| UT-0001 (Narmada) | Evidence waiting for review |
| UT-0004 (Himalaya) | Corrections requested |
| DOC-0001 (Vindhya lease) | Expires in six days |
| DOC-0004 (Kaveri lease) | Renewal already under review |
| DOC-0007 (Ganga Valley lease) | Old version kept after renewal |

## 0:00 – 0:30 · Opening

1. Show the sign-in page: "Demo authentication. All data is fictional."
2. Sign in as **Administrator**. The overview shows open applications, overdue cases and open alerts. Point out the sidebar counts and that every number links to its list.

## 0:30 – 1:45 · Scenario A: approval workflow

3. Sign out. Sign in as **Bureau officer**.
4. Open **APF-2026-0001** from the queue. Show the stepper: Scrutiny is current.
5. Tick the four checklist items, then **Complete stage** and confirm.
6. Sign out. Sign in as **EVC coordinator**.
7. Open **EVC scheduling**. APF-2026-0001 is in the *Awaiting scheduling* column. The board is the EVC queue.
8. Open the application's EVC tab. Save a visit date. Record the visit (at least 10 characters).
9. Return to the summary and **Complete stage**. It works only because the visit is now recorded. Try a second time on a stage without a visit to show the refusal if you have time.
10. Sign out. Sign in as **Competent authority**. Record **Approved** with a reason and the confirmation tick. The decision is never automatic.
11. Open the **Timeline** tab. Every step is listed with who did it and why.

## 1:45 – 2:45 · Scenario B: undertakings and compliance

12. Sign in as **Demo user, Vindhya** (institution). Open **Institutional undertakings** and then UT-0002. Show the due date and the evidence required.
13. Upload a PDF and add a note. The status becomes "Evidence awaiting review". Point out that it is not verified.
14. Sign in as **Committee reviewer**. Request corrections with remarks.
15. Sign in again as the institution. Resubmit corrected evidence (version 2).
16. As the reviewer, accept. Open the page: both versions remain, and the verification is recorded.

## 2:45 – 3:30 · Scenario C: lease expiry

17. As the institution, open **Lease & document validity** and then DOC-0001. Show "Expires within 7 days" and the validity bar.
18. Upload a renewal with a new expiry date. Its status is "Renewal under review"; the old copy is still the verified one.
19. As the reviewer, accept version 2. Version 1 shows as *Superseded* and remains in the history.

## 3:30 – 4:30 · Scenario D: alerts and escalation

20. Sign in as **Regional officer**. Open **Tasks & escalations** and press **Run monitoring checks**. Show the summary: new alerts and duplicates skipped.
21. Sign in as **Administrator**. Open **System settings** and press **+10 days**. The demo date moves on.
22. Back in Tasks & escalations, press **Run monitoring checks**. Overdue items raise escalations. Point out the escalation history.
23. Press the button again. The result reads **0 new alerts, 0 escalations**. Duplicates are never created for the same trigger.

## 4:30 – 5:00 · Scenario E: reporting and audit

24. Sign in as **Regional officer**. Open **Reports & analytics**. Choose a stage filter. Open **Overdue applications** and press **Export CSV**. The file downloads and the export is recorded.
25. Sign in as **Auditor**. Open **Audit trail**. Show application transitions, the undertaking verification, the document acceptance and the escalation entries. The auditor can read everything but change nothing: there are no action buttons on the application.

## Closing points (30 seconds)

- Automation routes, reminds and escalates. Humans decide. This is enforced in the code, not just in the screen.
- Permissions are checked on the server for every write and every query. Institution users see only their institution.
- Every change is recorded, and the database refuses to edit or delete audit rows.
- Known limits: no email or SMS, no AICTE integration, demo sign-in only. See the README.
