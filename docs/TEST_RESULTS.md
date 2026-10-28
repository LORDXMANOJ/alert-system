# Test results

Results from the final run on 27 October 2026, on the code in this commit. Each step was executed in this environment (Windows 11, Node 24.13.1, npm 11.8).

| Check | Command | Result |
|---|---|---|
| Type check (strict) | `npm run typecheck` | Passed, no errors |
| Lint (zero warnings allowed) | `npx eslint src tests scripts --max-warnings=0` | Passed, no errors or warnings |
| Unit and integration tests | `npm test` | **59 passed, 0 failed** (3 files) |
| Production build | `npm run build` | Passed; 24 routes built |
| Browser walkthroughs (Playwright, Chromium) | `npm run test:e2e` | **7 passed, 0 failed** |

## Unit and integration tests (`tests/`)

- `workflow.test.ts` (23 tests): template selection by category; required fields; owner-only stage completion; no skipping with an unconfirmed checklist; EVC queue entry only after the preliminary stage; EVC gating before completion; no decision through Complete stage; return requires a reason; clarification and response; decision by the competent authority only, with confirmation; institution and regional scoping; NOT_FOUND for another institution's record; EVC scheduling permissions.
- `monitoring.test.ts` (13 tests): threshold boundaries (today, tomorrow, exactly at 7, 15, 30, one day outside, overdue); repeated runs create no duplicate alerts; one alert per record and threshold; expiry alert for a six-day lease; no expiry alert while a renewal is under review; escalation is idempotent; escalation levels recorded; resolution note required; automatic clearing when a renewal is submitted; the check requires the right role.
- `compliance-security.test.ts` (23 tests): due date from configured days; submission does not verify; only a reviewer can verify; corrections require remarks; evidence versions kept; renewal keeps the previous version; renewal not verified before review; second renewal refused while one is pending; expiry classification; file validation by content and extension; 10 MB limit; cross-institution file access refused; no self role change; role change recorded; auditor has no write permissions; CSV export refused to institutions; export recorded; regional export scoped; audit entries written; audit rows cannot be updated or deleted; CSV formula neutralisation.

## Browser walkthroughs (`tests/e2e/walkthrough.spec.ts`)

1. Overview and sign-in show role-specific views.
2. **Scenario A:** scrutiny → EVC queue → scheduling → visit recorded → stage completed → decision → timeline.
3. **Scenario B:** institution submits evidence → reviewer requests corrections → resubmission → verification → both versions shown.
4. **Scenario C:** expiry warning → renewal uploaded → reviewer accepts → old version kept as superseded.
5. **Scenario D:** run checks → clock +10 days → escalations → run again → "0 new alerts, 0 escalations".
6. **Scenario E:** pendency report with filters → overdue report → CSV export (200, text/csv) → auditor sees audit entries and has no action buttons.
7. Mobile (390 px): applications page has no horizontal page overflow.

Screenshots from these runs are written to `docs/screenshots/` (or the folder in `SCREENSHOT_DIR`): 18 images, desktop and mobile.

## Notes

- The walkthroughs reset the demo data through the app's own Demo Control at the start of each run.
- An earlier run reused a production server still running an older build, which gave a server error page. The final run used a fresh server on a separate port, and all seven passed.
- These tests cover the prototype's logic and screens. They are not a security audit, a load test, or a review against the APH.
