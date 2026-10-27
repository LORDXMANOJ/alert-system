"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clearSessionCookie, getCurrentActor, setSessionCookie } from "@/server/auth";
import { getDb } from "@/server/db";
import type { Db } from "@/server/db/client";
import { ServiceError, fail } from "@/server/errors";
import type { Actor } from "@/server/permissions";
import { MAX_UPLOAD_BYTES } from "@/server/services/compliance";
import * as workflow from "@/server/services/workflow";
import * as evc from "@/server/services/evc";
import * as compliance from "@/server/services/compliance";
import { runMonitoringChecks, updateAlert } from "@/server/services/monitoring";
import { markAllRead, markRead } from "@/server/services/notifications";
import * as admin from "@/server/services/admin";

type Ok = { ok: true; message: string; href?: string };
type Err = { ok: false; error: string };
export type Result = Ok | Err;

type Outcome = string | { message: string; href?: string };

/** Runs a write with the session check, error handling and page refresh that every action needs. */
async function act(fn: (actor: Actor, db: Db) => Promise<Outcome>): Promise<Result> {
  const actor = await getCurrentActor();
  if (!actor) return { ok: false, error: "Your demo session has ended. Sign in again." };
  try {
    const db = await getDb();
    const outcome = await fn(actor, db);
    revalidatePath("/", "layout");
    return typeof outcome === "string" ? { ok: true, message: outcome } : { ok: true, ...outcome };
  } catch (err) {
    if (err instanceof ServiceError) return { ok: false, error: err.message };
    console.error("[action]", err);
    return { ok: false, error: "Something went wrong and nothing was saved. Try again." };
  }
}

function text(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v : "";
}

async function fileFrom(fd: FormData, name: string): Promise<{ fileName: string; bytes: Uint8Array }> {
  const f = fd.get(name);
  if (!(f instanceof File) || f.size === 0) fail("INVALID_INPUT", "Choose a file to upload.");
  if (f.size > MAX_UPLOAD_BYTES) fail("INVALID_INPUT", "Files must be 10 MB or smaller.");
  return { fileName: f.name, bytes: new Uint8Array(await f.arrayBuffer()) };
}

/* ---------- Session ---------- */

export async function loginAction(fd: FormData): Promise<void> {
  const userId = text(fd, "userId");
  const db = await getDb();
  const found = await db.query<{ id: string }>("SELECT id FROM users WHERE id = $1", [userId]);
  if (!found.rows[0]) redirect("/login?error=unknown");
  await setSessionCookie(userId);
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}

/* ---------- Applications and workflow ---------- */

export async function createApplicationAction(fd: FormData): Promise<Result> {
  return act(async (actor, db) => {
    const id = await workflow.createApplication(db, actor, {
      title: text(fd, "title"),
      category: text(fd, "category"),
      institutionId: text(fd, "institutionId") || undefined,
    });
    return { message: `Application ${id} submitted.`, href: `/applications/${id}` };
  });
}

export async function completeStageAction(fd: FormData): Promise<Result> {
  return act(async (actor, db) => {
    const count = Number(text(fd, "count")) || 0;
    const checklist = Array.from({ length: count }, (_, i) => fd.get(`c${i}`) === "on");
    await workflow.completeStage(db, actor, text(fd, "applicationId"), {
      checklist,
      observations: text(fd, "observations"),
    });
    return "Stage completed. The application has moved to its next configured stage.";
  });
}

export async function returnAction(fd: FormData): Promise<Result> {
  return act(async (actor, db) => {
    await workflow.returnForClarification(db, actor, text(fd, "applicationId"), text(fd, "reason"));
    return "Application returned for clarification. The institution has been notified.";
  });
}

export async function respondAction(fd: FormData): Promise<Result> {
  return act(async (actor, db) => {
    await workflow.respondToClarification(db, actor, text(fd, "applicationId"), text(fd, "response"));
    return "Response sent. The application has resumed at its current stage.";
  });
}

export async function decideAction(fd: FormData): Promise<Result> {
  return act(async (actor, db) => {
    await workflow.recordDecision(db, actor, text(fd, "applicationId"), {
      outcome: text(fd, "outcome"),
      reason: text(fd, "reason"),
      checklistConfirmed: fd.get("confirmed") === "on",
    });
    return "Decision recorded by the competent authority.";
  });
}

export async function assignAction(fd: FormData): Promise<Result> {
  return act(async (actor, db) => {
    await workflow.assignApplication(db, actor, text(fd, "applicationId"), text(fd, "userId"));
    return "Assignee updated.";
  });
}

export async function updateStageTargetAction(fd: FormData): Promise<Result> {
  return act(async (actor, db) => {
    await workflow.updateStageTarget(db, actor, Number(text(fd, "stageId")), Number(text(fd, "targetDays")));
    return "Target duration saved. It applies to applications that enter this stage from now on.";
  });
}

/* ---------- EVC ---------- */

export async function scheduleEvcAction(fd: FormData): Promise<Result> {
  return act(async (actor, db) => {
    await evc.scheduleVisit(db, actor, text(fd, "applicationId"), {
      scheduledFor: text(fd, "scheduledFor"),
      notes: text(fd, "notes"),
    });
    return "Visit scheduled. The institution has been notified.";
  });
}

export async function completeEvcAction(fd: FormData): Promise<Result> {
  return act(async (actor, db) => {
    await evc.completeVisit(db, actor, text(fd, "applicationId"), text(fd, "notes"));
    return "Visit recorded as completed. The EVC stage can now be completed.";
  });
}

export async function reportPendingAction(fd: FormData): Promise<Result> {
  return act(async (actor, db) => {
    await evc.markReportPending(db, actor, text(fd, "applicationId"));
    return "EVC marked as report pending.";
  });
}

/* ---------- Undertakings and compliance ---------- */

export async function createUndertakingAction(fd: FormData): Promise<Result> {
  return act(async (actor, db) => {
    const id = await compliance.createUndertaking(db, actor, {
      applicationId: text(fd, "applicationId"),
      condition: text(fd, "condition"),
      evidenceRequired: text(fd, "evidenceRequired"),
      dueInDays: text(fd, "dueInDays"),
    });
    return { message: `Undertaking ${id} recorded.`, href: `/undertakings/${id}` };
  });
}

export async function submitEvidenceAction(fd: FormData): Promise<Result> {
  return act(async (actor, db) => {
    const file = await fileFrom(fd, "file");
    await compliance.submitUndertakingEvidence(db, actor, text(fd, "undertakingId"), { note: text(fd, "note"), ...file });
    return "Evidence submitted for review. It counts as verified only after a reviewer accepts it.";
  });
}

export async function reviewUndertakingAction(fd: FormData): Promise<Result> {
  return act(async (actor, db) => {
    await compliance.reviewUndertakingSubmission(db, actor, text(fd, "undertakingId"), {
      outcome: text(fd, "outcome"),
      remarks: text(fd, "remarks"),
    });
    return text(fd, "outcome") === "accepted" ? "Undertaking verified and recorded." : "Corrections requested. The institution has been notified.";
  });
}

/* ---------- Documents ---------- */

export async function createDocumentAction(fd: FormData): Promise<Result> {
  return act(async (actor, db) => {
    const file = await fileFrom(fd, "file");
    const id = await compliance.createDocument(
      db,
      actor,
      { title: text(fd, "title"), category: text(fd, "category"), expiresOn: text(fd, "expiresOn") },
      file,
    );
    return { message: `${id} uploaded. It is not verified until a reviewer accepts it.`, href: `/documents/${id}` };
  });
}

export async function renewalAction(fd: FormData): Promise<Result> {
  return act(async (actor, db) => {
    const file = await fileFrom(fd, "file");
    await compliance.uploadRenewal(db, actor, text(fd, "documentId"), { expiresOn: text(fd, "expiresOn") }, file);
    return "Renewal uploaded. The previous version stays in the history until a reviewer accepts this one.";
  });
}

export async function reviewDocumentAction(fd: FormData): Promise<Result> {
  return act(async (actor, db) => {
    await compliance.reviewDocumentVersion(db, actor, text(fd, "documentId"), Number(text(fd, "versionNo")), {
      outcome: text(fd, "outcome"),
      remarks: text(fd, "remarks"),
    });
    return text(fd, "outcome") === "accepted" ? "Version accepted. It is now the verified copy." : "Version returned for corrections.";
  });
}

/* ---------- Alerts, monitoring and notifications ---------- */

export async function runChecksAction(): Promise<Result> {
  return act(async (actor, db) => {
    const s = await runMonitoringChecks(db, actor);
    return `Checks complete: ${s.created} new alert(s), ${s.escalated} escalation(s), ${s.autoResolved} cleared automatically, ${s.duplicatesSkipped} duplicate(s) skipped.`;
  });
}

export async function acknowledgeAlertAction(alertId: number): Promise<Result> {
  return act(async (actor, db) => {
    await updateAlert(db, actor, alertId, "acknowledge");
    return "Alert acknowledged.";
  });
}

export async function resolveAlertAction(fd: FormData): Promise<Result> {
  return act(async (actor, db) => {
    await updateAlert(db, actor, Number(text(fd, "alertId")), "resolve", text(fd, "note"));
    return "Alert resolved with a note in the history.";
  });
}

export async function markReadAction(id: number): Promise<Result> {
  return act(async (actor, db) => {
    await markRead(db, actor, id);
    return "Marked as read.";
  });
}

export async function markAllReadAction(): Promise<Result> {
  return act(async (actor, db) => {
    await markAllRead(db, actor);
    return "All notifications marked as read.";
  });
}

/* ---------- Administration and demo control ---------- */

export async function setRoleAction(fd: FormData): Promise<Result> {
  return act(async (actor, db) => {
    await admin.setUserRole(db, actor, text(fd, "userId"), text(fd, "role"));
    return "Role updated and recorded in the audit trail.";
  });
}

export async function toggleRuleAction(fd: FormData): Promise<Result> {
  return act(async (actor, db) => {
    await admin.setRuleEnabled(db, actor, text(fd, "ruleId"), text(fd, "enabled") === "true");
    return "Alert rule updated.";
  });
}

export async function shiftClockAction(days: number): Promise<Result> {
  return act(async (actor, db) => {
    await admin.shiftClock(db, actor, days);
    return `Demo clock moved ${days > 0 ? "forward" : "back"} ${Math.abs(days)} day(s). Run checks to see the effect.`;
  });
}

export async function resetDemoAction(): Promise<Result> {
  return act(async (actor, db) => {
    await admin.resetDemo(db, actor);
    return "Demo data reset to the starting state.";
  });
}
