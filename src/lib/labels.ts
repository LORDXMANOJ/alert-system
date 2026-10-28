/** Plain-language labels for stored codes. Client-safe. */
export const EVENT_LABELS: Record<string, string> = {
  submitted: "Submitted",
  stage_completed: "Stage completed",
  returned_for_clarification: "Returned for clarification",
  clarification_response: "Institution responded",
  decision_recorded: "Decision recorded",
  evc_queued: "Queued for EVC",
  evc_scheduled: "EVC visit scheduled",
  evc_visit_completed: "EVC visit completed",
  assigned: "Assignee changed",
};

export const APP_STATUS_LABELS: Record<string, string> = {
  in_progress: "In progress",
  clarification: "Clarification requested",
  decided: "Decided",
};

export const DECISION_LABELS: Record<string, string> = {
  approved: "Approved",
  deferred: "Deferred",
  rejected: "Rejected",
};

export const UT_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  submitted: "Evidence awaiting review",
  correction_requested: "Corrections requested",
  verified: "Verified",
};

export const VALIDITY_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  valid: "success",
  expiring_30: "warning",
  expiring_7: "warning",
  expired: "danger",
  renewal_review: "info",
  not_verified: "neutral",
};

export const SEVERITY_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  info: "info",
  warning: "warning",
  critical: "danger",
  success: "success",
};

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
