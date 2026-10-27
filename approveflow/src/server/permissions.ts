import { fail } from "./errors";

/** Demonstration roles. Proposed for the prototype; not official AICTE designations. */
export const ROLES = [
  "admin",
  "institution",
  "regional",
  "bureau",
  "evc",
  "reviewer",
  "authority",
  "auditor",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  institution: "Institution user",
  regional: "Regional officer",
  bureau: "Bureau officer",
  evc: "EVC coordinator",
  reviewer: "Committee reviewer",
  authority: "Competent authority",
  auditor: "Auditor",
};

export type Actor = {
  id: string;
  name: string;
  designation: string;
  role: Role;
  institutionId: string | null;
  regionId: string | null;
};

export type Permission =
  | "app.create"
  | "app.view"
  | "app.stage"
  | "app.return"
  | "app.respond"
  | "app.decide"
  | "evc.manage"
  | "ut.create"
  | "ut.submit"
  | "ut.review"
  | "doc.upload"
  | "doc.review"
  | "alert.run"
  | "alert.update"
  | "report.export"
  | "audit.view"
  | "admin.manage"
  | "demo.control";

const PERMISSIONS: Record<Role, Permission[]> = {
  admin: ["app.view", "alert.run", "alert.update", "report.export", "audit.view", "admin.manage", "demo.control"],
  institution: ["app.create", "app.view", "app.respond", "ut.submit", "doc.upload"],
  regional: ["app.view", "alert.run", "alert.update", "report.export"],
  bureau: ["app.create", "app.view", "app.stage", "app.return", "ut.create"],
  evc: ["app.view", "app.stage", "evc.manage"],
  reviewer: ["app.view", "app.stage", "app.return", "ut.create", "ut.review", "doc.review"],
  authority: ["app.view", "app.decide"],
  auditor: ["app.view", "audit.view", "report.export"],
};

export function can(actor: Actor, permission: Permission): boolean {
  return PERMISSIONS[actor.role].includes(permission);
}

export function assertCan(actor: Actor, permission: Permission, message?: string): void {
  if (!can(actor, permission)) {
    fail("FORBIDDEN", message ?? `Your role (${ROLE_LABELS[actor.role]}) cannot perform this action.`);
  }
}

/**
 * Record scoping. Institution users see only their institution. Regional officers see only
 * their region. Everyone else sees the national view. This is enforced in every query.
 */
export function scopeWhere(
  actor: Actor,
  columns: { institution: string; region: string },
  startIndex: number,
): { sql: string; params: unknown[] } {
  if (actor.role === "institution") {
    return { sql: `${columns.institution} = $${startIndex}`, params: [actor.institutionId] };
  }
  if (actor.role === "regional") {
    return { sql: `${columns.region} = $${startIndex}`, params: [actor.regionId] };
  }
  return { sql: "TRUE", params: [] };
}

export function canViewRecord(
  actor: Actor,
  record: { institutionId: string; regionId: string },
): boolean {
  if (!can(actor, "app.view") && actor.role !== "institution") return false;
  if (actor.role === "institution") return record.institutionId === actor.institutionId;
  if (actor.role === "regional") return record.regionId === actor.regionId;
  return true;
}

export function assertCanView(
  actor: Actor,
  record: { institutionId: string; regionId: string },
): void {
  if (!canViewRecord(actor, record)) fail("NOT_FOUND", "Record not found or not in your scope.");
}
