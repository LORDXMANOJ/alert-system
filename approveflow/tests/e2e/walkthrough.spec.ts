import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

/**
 * Judge walkthroughs A to E, driven through the real UI with demo sign-in.
 * Runs in order. Starts from a reset of the demonstration data (through Demo Control).
 * Screenshots go to presentation/screenshots/.
 */

const SHOTS = path.resolve(__dirname, "../../../presentation/screenshots");
const PDF = { name: "evidence.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% demonstration evidence\n%%EOF\n") };

/** Signs in with the demo card that contains `who` (a role label, or an account name such as "Demo user, Vindhya"). */
async function signIn(page: Page, who: string) {
  await page.goto("/login");
  await page.locator("form").filter({ hasText: who }).first().getByRole("button").first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out (demo)" }).click();
  await page.waitForURL(/\/login/);
}

async function shot(page: Page, name: string, mobile = false) {
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(SHOTS, `${name}${mobile ? "-mobile" : ""}.png`), fullPage: false });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  // Start every run from the seeded state, using Demo Control (no database editing).
  const page = await browser.newPage();
  await signIn(page, "Administrator");
  await page.goto("/admin/settings");
  await page.getByRole("button", { name: "Reset demo data" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Reset data" }).click();
  await expect(page.getByText("Demo data reset to the starting state.")).toBeVisible();
  await page.close();
});

test("Overview and sign-in show role-specific views", async ({ page }) => {
  await signIn(page, "Administrator");
  await expect(page.getByRole("heading", { name: /Welcome, Dr\. Asha Verma/ })).toBeVisible();
  await shot(page, "01-overview-admin");
  await signOut(page);
  await signIn(page, "Bureau officer");
  await expect(page.getByRole("heading", { name: "Your queue" })).toBeVisible();
  await shot(page, "02-overview-bureau");
});

test("Scenario A: scrutiny, EVC queue, scheduling and decision", async ({ page }) => {
  // 1. Bureau officer completes the preliminary scrutiny stage.
  await signIn(page, "Bureau officer");
  await page.goto("/applications/APF-2026-0001");
  await expect(page.getByRole("heading", { name: /B\.Tech Artificial Intelligence/ })).toBeVisible();
  await shot(page, "03-application-detail-scrutiny");
  const form = page.getByRole("form", { name: "Complete stage" });
  for (let i = 0; i < 4; i++) await form.locator(`input[name="c${i}"]`).check();
  await form.getByRole("button", { name: "Complete stage" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Complete stage" }).click();
  await expect(page.getByText(/Stage completed/)).toBeVisible();
  await signOut(page);

  // 2. The application is now in the EVC queue. The coordinator schedules and records the visit.
  await signIn(page, "EVC coordinator");
  await page.goto("/evc");
  await expect(page.getByText("APF-2026-0001").first()).toBeVisible();
  await shot(page, "04-evc-board");
  await page.goto("/applications/APF-2026-0001?tab=evc");
  await page.getByRole("form", { name: "Schedule EVC visit" }).getByRole("button", { name: "Save schedule" }).click();
  await expect(page.getByText("Visit scheduled. The institution has been notified.")).toBeVisible();
  await page.getByRole("form", { name: "Record EVC visit" }).locator("textarea").fill("Visit held. Laboratories and faculty records reviewed.");
  await page.getByRole("form", { name: "Record EVC visit" }).getByRole("button", { name: "Mark visit completed" }).click();
  await expect(page.getByText("Visit recorded as completed.")).toBeVisible();
  await shot(page, "05-evc-record");
  // The stage completes only after the visit is recorded.
  await page.goto("/applications/APF-2026-0001");
  await page.getByRole("form", { name: "Complete stage" }).getByRole("button", { name: "Complete stage" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Complete stage" }).click();
  await expect(page.getByText(/Stage completed/)).toBeVisible();
  await signOut(page);

  // 3. The competent authority records the decision (never automatic).
  await signIn(page, "Competent authority");
  await page.goto("/applications/APF-2026-0001");
  const decide = page.getByRole("form", { name: "Record decision" });
  await decide.getByLabel("Approved").check();
  await decide.locator("textarea").fill("History and observations reviewed. Criteria met.");
  await decide.getByRole("checkbox").check();
  await decide.getByRole("button", { name: "Record decision" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByText("Decision recorded by the competent authority.")).toBeVisible();

  // 4. Inspect the timeline.
  await page.goto("/applications/APF-2026-0001?tab=timeline");
  await expect(page.getByText("Decision recorded").first()).toBeVisible();
  await shot(page, "06-application-timeline");
});

test("Scenario B: undertaking evidence, correction and verification", async ({ page }) => {
  await signIn(page, "Demo user, Vindhya");
  await page.goto("/undertakings");
  await page.getByRole("link", { name: /Seminar hall|seminar hall/ }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/seminar hall/i);
  await shot(page, "07-undertaking-detail");
  const submit = page.getByRole("form", { name: "Submit evidence" });
  await submit.locator('input[type="file"]').setInputFiles(PDF);
  await submit.locator("textarea").fill("Completion photographs and the engineer's note attached.");
  await submit.getByRole("button", { name: "Submit evidence" }).click();
  await expect(page.getByText(/Evidence submitted for review/)).toBeVisible();
  await signOut(page);

  // Reviewer requests a correction, then the institution resubmits and the reviewer accepts.
  await signIn(page, "Committee reviewer");
  await page.goto("/undertakings");
  await page.getByRole("link", { name: /seminar hall/i }).first().click();
  const review = page.getByRole("form", { name: "Review evidence" });
  await review.getByLabel("Request corrections").check();
  await review.locator("textarea").fill("The photographs do not show the completed roof. Please add a dated photograph.");
  await review.getByRole("button", { name: "Record outcome" }).click();
  await expect(page.getByText("Corrections requested. The institution has been notified.")).toBeVisible();
  await signOut(page);

  await signIn(page, "Demo user, Vindhya");
  await page.goto("/undertakings");
  await page.getByRole("link", { name: /seminar hall/i }).first().click();
  await page.getByRole("form", { name: "Submit evidence" }).locator('input[type="file"]').setInputFiles(PDF);
  await page.getByRole("form", { name: "Submit evidence" }).locator("textarea").fill("Dated roof photograph added as requested.");
  await page.getByRole("form", { name: "Submit evidence" }).getByRole("button", { name: "Submit evidence" }).click();
  await expect(page.getByText(/Evidence submitted for review/)).toBeVisible();
  await signOut(page);

  await signIn(page, "Committee reviewer");
  await page.goto("/undertakings");
  await page.getByRole("link", { name: /seminar hall/i }).first().click();
  const accept = page.getByRole("form", { name: "Review evidence" });
  await accept.getByLabel("Accept evidence and verify").check();
  await accept.getByRole("button", { name: "Record outcome" }).click();
  await expect(page.getByText("Undertaking verified and recorded.")).toBeVisible();
  await page.goto("/undertakings/UT-0002");
  await expect(page.getByText("Version 1").first()).toBeVisible();
  await expect(page.getByText("Version 2").first()).toBeVisible();
  await shot(page, "08-undertaking-history");
});

test("Scenario C: lease expiry alert, renewal, review, and history", async ({ page }) => {
  await signIn(page, "Demo user, Vindhya");
  await page.goto("/documents");
  await expect(page.getByText("Expires within 7 days").first()).toBeVisible();
  await shot(page, "09-document-register");
  await page.goto("/documents/DOC-0001");
  await expect(page.getByText("Expires within 7 days").first()).toBeVisible();
  await shot(page, "10-document-expiring");
  const renew = page.getByRole("form", { name: "Upload renewal" });
  await renew.locator('input[name="expiresOn"]').fill("2028-06-30");
  await renew.locator('input[type="file"]').setInputFiles({ ...PDF, name: "lease-renewal.pdf" });
  await renew.getByRole("button", { name: "Submit renewal" }).click();
  await expect(page.getByText(/Renewal uploaded/)).toBeVisible();
  await signOut(page);

  await signIn(page, "Committee reviewer");
  await page.goto("/documents/DOC-0001");
  const review = page.getByRole("form", { name: "Review document version" });
  await review.getByLabel("Accept as verified").check();
  await review.getByRole("button", { name: "Record review" }).click();
  await expect(page.getByText("Version accepted. It is now the verified copy.")).toBeVisible();
  // The previous version is still in the history.
  await expect(page.getByText("Version 1").first()).toBeVisible();
  await expect(page.getByText("Superseded")).toBeVisible();
  await shot(page, "11-document-renewal-history");
});

test("Scenario D: run checks, shift the clock, escalate, and confirm no duplicates", async ({ page }) => {
  await signIn(page, "Regional officer");
  await page.goto("/alerts");
  await shot(page, "12-alerts-centre");
  await page.getByRole("button", { name: "Run monitoring checks" }).click();
  await expect(page.getByText(/Checks complete:/)).toBeVisible();
  await signOut(page);

  await signIn(page, "Administrator");
  await page.goto("/admin/settings");
  await page.getByRole("button", { name: "+10 days" }).click();
  await expect(page.getByText("Demo clock moved forward 10 day(s).")).toBeVisible();
  await page.goto("/alerts");
  await page.getByRole("button", { name: "Run monitoring checks" }).click();
  await expect(page.getByText(/Checks complete:.*escalation/)).toBeVisible();
  await shot(page, "13-escalations");
  await page.getByRole("button", { name: "Run monitoring checks" }).click();
  await expect(page.getByText(/Checks complete: 0 new alert\(s\), 0 escalation\(s\)/)).toBeVisible();
  await page.getByRole("heading", { name: "Escalation history" }).scrollIntoViewIfNeeded();
  await shot(page, "14-escalation-history");
});

test("Scenario E: reporting, filters, CSV export and audit trail", async ({ page }) => {
  await signIn(page, "Regional officer");
  await page.goto("/reports?report=pendency");
  await expect(page.getByRole("heading", { name: "Reports & analytics" })).toBeVisible();
  await page.getByRole("combobox").nth(1).selectOption("reviewer");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await shot(page, "15-reports-pendency");
  await page.goto("/reports?report=overdue");
  await expect(page.getByRole("link", { name: "Export CSV" })).toBeVisible();
  const href = await page.getByRole("link", { name: "Export CSV" }).getAttribute("href");
  const csv = await page.request.get(href!);
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  await shot(page, "16-reports-overdue");
  await signOut(page);

  await signIn(page, "Auditor");
  await page.goto("/audit");
  await expect(page.getByText("application.stage_completed").first()).toBeVisible();
  await expect(page.getByText("undertaking.accepted").first()).toBeVisible();
  await expect(page.getByText("document.version_accepted").first()).toBeVisible();
  await shot(page, "17-audit-trail");
  // Auditors cannot change anything.
  await page.goto("/applications/APF-2026-0001");
  await expect(page.getByRole("form", { name: "Complete stage" })).toHaveCount(0);
});

test("Mobile layout keeps the main screens usable", async ({ page }) => {
  await signIn(page, "Bureau officer");
  await page.goto("/applications");
  await shot(page, "18-applications", true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
