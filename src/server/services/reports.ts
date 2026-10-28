import type { Db } from "../db/client";
import { fail } from "../errors";
import { assertCan, scopeWhere, type Actor } from "../permissions";
import { audit } from "../audit";
import { now, daysBetween } from "../clock";
import { APP_SELECT, isOverdue, type ApplicationRow } from "./workflow";
import { listEvcRecords } from "./evc";
import { listUndertakings, listDocuments, documentValidity } from "./compliance";

export const REPORT_TYPES = [
  { id: "pendency", label: "Stage-wise pendency", description: "Open applications grouped by stage and region." },
  { id: "ageing", label: "Application ageing", description: "Open applications by days since submission." },
  { id: "overdue", label: "Overdue applications", description: "Applications past their stage deadline." },
  { id: "workload", label: "Workload by responsible role", description: "Open and overdue cases per role." },
  { id: "evc", label: "EVC status", description: "Every EVC record with its schedule and status." },
  { id: "undertakings", label: "Undertaking compliance", description: "Undertakings with due dates and status." },
  { id: "documents", label: "Document validity", description: "Documents with validity and review status." },
  { id: "escalations", label: "Escalation history", description: "Every escalation event raised by the engine." },
  { id: "audit", label: "Audit trail", description: "Recorded actions (auditors and administrators)." },
] as const;

export type ReportId = (typeof REPORT_TYPES)[number]["id"];

export type ReportFilters = { regionId?: string; stageRole?: string };

type ReportResult = { columns: string[]; rows: Record<string, unknown>[] };

/** CSV cells starting with = + - @ are neutralised so spreadsheets do not run them as formulas. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export async function buildReport(db: Db, actor: Actor, id: ReportId, filters: ReportFilters = {}): Promise<ReportResult> {
  const scope = scopeWhere(actor, { institution: "a.institution_id", region: "a.region_id" }, 1);
  const n = scope.params.length;
  const regionParam = filters.regionId || null;
  const stageParam = filters.stageRole || null;
  const openApps = await db.query<ApplicationRow>(
    `${APP_SELECT}
     WHERE ${scope.sql} AND a.status <> 'decided'
       AND ($${n + 1}::text IS NULL OR a.region_id = $${n + 1})
       AND ($${n + 2}::text IS NULL OR s.role = $${n + 2})
     ORDER BY a.due_at`,
    [...scope.params, regionParam, stageParam],
  );
  const open = openApps.rows;
  const t = now();

  switch (id) {
    case "pendency": {
      const groups = new Map<string, { stage: string; role: string; region: string; open: number; overdue: number }>();
      for (const a of open) {
        const key = `${a.stage_name}|${a.region_name}`;
        const g = groups.get(key) ?? { stage: a.stage_name, role: a.stage_role, region: a.region_name, open: 0, overdue: 0 };
        g.open += 1;
        if (isOverdue(a)) g.overdue += 1;
        groups.set(key, g);
      }
      return { columns: ["stage", "role", "region", "open", "overdue"], rows: [...groups.values()] };
    }
    case "ageing": {
      const buckets = [
        { bucket: "0-15 days", min: 0, max: 15 },
        { bucket: "16-30 days", min: 16, max: 30 },
        { bucket: "31-60 days", min: 31, max: 60 },
        { bucket: "60+ days", min: 61, max: Number.POSITIVE_INFINITY },
      ];
      const rows = buckets.map((b) => ({ bucket: b.bucket, applications: 0 }));
      for (const a of open) {
        const age = daysBetween(a.submitted_at, t);
        const idx = buckets.findIndex((b) => age >= b.min && age <= b.max);
        if (idx >= 0) rows[idx].applications += 1;
      }
      return { columns: ["bucket", "applications"], rows };
    }
    case "overdue": {
      const rows = open
        .filter((a) => isOverdue(a))
        .map((a) => ({
          application: a.id,
          title: a.title,
          institution: a.institution_name,
          region: a.region_name,
          stage: a.stage_name,
          responsible_role: a.stage_role,
          due_at: a.due_at,
          days_overdue: daysBetween(a.due_at, t),
        }));
      return {
        columns: ["application", "title", "institution", "region", "stage", "responsible_role", "due_at", "days_overdue"],
        rows,
      };
    }
    case "workload": {
      const roles = new Map<string, { role: string; open: number; overdue: number }>();
      for (const a of open) {
        const g = roles.get(a.stage_role) ?? { role: a.stage_role, open: 0, overdue: 0 };
        g.open += 1;
        if (isOverdue(a)) g.overdue += 1;
        roles.set(a.stage_role, g);
      }
      return { columns: ["role", "open", "overdue"], rows: [...roles.values()] };
    }
    case "evc": {
      const rows = (await listEvcRecords(db, actor)).map((e) => ({
        application: e.application_id,
        institution: e.institution_name,
        region: e.region_name,
        new_institution: e.institution_is_new ? "yes" : "no",
        status: e.status,
        target_date: e.target_date,
        scheduled_date: e.scheduled_date,
        completed_date: e.completed_date,
      }));
      return {
        columns: ["application", "institution", "region", "new_institution", "status", "target_date", "scheduled_date", "completed_date"],
        rows,
      };
    }
    case "undertakings": {
      const rows = (await listUndertakings(db, actor)).map((u) => ({
        undertaking: u.id,
        institution: u.institution_name,
        application: u.application_id,
        condition: u.condition,
        status: u.status,
        due_at: u.due_at,
        overdue: u.status !== "verified" && u.due_at.getTime() < t.getTime() ? "yes" : "no",
      }));
      return { columns: ["undertaking", "institution", "application", "condition", "status", "due_at", "overdue"], rows };
    }
    case "documents": {
      const rows = (await listDocuments(db, actor)).map((d) => {
        const v = documentValidity(d);
        return {
          document: d.id,
          institution: d.institution_name,
          category: d.category,
          title: d.title,
          validity: v.label,
          expires_at: d.current_expires_at,
          days_remaining: v.days,
        };
      });
      return { columns: ["document", "institution", "category", "title", "validity", "expires_at", "days_remaining"], rows };
    }
    case "escalations": {
      const alertScope = scopeWhere(actor, { institution: "al.institution_id", region: "al.region_id" }, 1);
      const res = await db.query<Record<string, unknown>>(
        `SELECT e.created_at, al.id AS alert_id, al.entity_label, al.severity, e.level, e.to_role, e.reason, al.status
         FROM escalation_events e JOIN alerts al ON al.id = e.alert_id
         WHERE ${alertScope.sql} ORDER BY e.created_at DESC`,
        alertScope.params,
      );
      return {
        columns: ["created_at", "alert_id", "entity_label", "severity", "level", "to_role", "reason", "status"],
        rows: res.rows,
      };
    }
    case "audit": {
      const res = await db.query<Record<string, unknown>>(
        "SELECT created_at, actor_id, actor_role, action, entity_type, entity_id, reason FROM audit_logs ORDER BY id DESC LIMIT 2000",
      );
      return { columns: ["created_at", "actor_id", "actor_role", "action", "entity_type", "entity_id", "reason"], rows: res.rows };
    }
    default:
      return fail("NOT_FOUND", "Unknown report.");
  }
}

/** Authorized, audited CSV export. Only roles with report.export may call this. */
export async function exportReportCsv(db: Db, actor: Actor, id: ReportId, filters: ReportFilters = {}): Promise<string> {
  assertCan(actor, "report.export");
  if (id === "audit") assertCan(actor, "audit.view");
  const report = await buildReport(db, actor, id, filters);
  const csv = toCsv(report.rows);
  await audit(db, actor, "report.exported", "report", id, { rows: report.rows.length, filters });
  return csv;
}
