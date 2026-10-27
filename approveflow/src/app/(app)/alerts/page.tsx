import Link from "next/link";
import { BellRing, CheckCircle2, ShieldAlert } from "lucide-react";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { can, scopeWhere } from "@/server/permissions";
import { listAlerts } from "@/server/services/monitoring";
import { Badge, Card, EmptyState, PageHeader, TableWrap, cn, inputCls, th, td } from "@/components/ui";
import { ActionButton, ServerForm } from "@/components/server-form";
import { acknowledgeAlertAction, resolveAlertAction, runChecksAction } from "@/app/actions";
import { fmtDateTime } from "@/lib/labels";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "acknowledged", label: "Acknowledged" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

export default async function AlertsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const actor = (await getCurrentActor())!;
  const db = await getDb();
  const status = sp.status && ["open", "acknowledged", "resolved"].includes(sp.status) ? sp.status : sp.status === "all" ? undefined : "open";
  const rows = await listAlerts(db, actor, status);
  const scope = scopeWhere(actor, { institution: "al.institution_id", region: "al.region_id" }, 1);
  const escalations = await db.query<{ created_at: Date; alert_id: number; entity_label: string; level: number; to_role: string; reason: string; status: string }>(
    `SELECT e.created_at, e.alert_id, al.entity_label, e.level, e.to_role, e.reason, al.status
     FROM escalation_events e JOIN alerts al ON al.id = e.alert_id
     WHERE ${scope.sql} ORDER BY e.created_at DESC LIMIT 25`,
    scope.params,
  );
  const last = await db.query<{ value: string }>("SELECT value FROM system_settings WHERE key = 'last_monitoring_run'");
  const lastRun = last.rows[0] ? (JSON.parse(last.rows[0].value) as Record<string, number | string>) : null;
  const canRun = can(actor, "alert.run");
  const canUpdate = can(actor, "alert.update");
  const active = (k: string) => (sp.status ?? "open") === k || (k === "all" && sp.status === "all");

  return (
    <>
      <PageHeader
        title="Tasks & escalations"
        description="Alerts raised by the deadline engine, the escalations they triggered, and the history of every acknowledgement and resolution."
        actions={
          canRun ? (
            <ActionButton action={runChecksAction} label="Run monitoring checks" variant="primary" size="md" />
          ) : null
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card bodyClassName="px-5 py-4" className="lg:col-span-2">
          <p className="text-sm font-medium text-navy">How the checks work</p>
          <p className="mt-1 text-sm text-slate-600">
            Each check finds records with a deadline and raises one alert per record and threshold. Running checks again never creates a duplicate.
            Alerts clear automatically when their condition ends. Overdue alerts are escalated once each delay passes, and never close or decide a case.
          </p>
        </Card>
        <Card bodyClassName="px-5 py-4" title="Last run">
          {lastRun ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-500">Checked</dt><dd className="tnum text-navy">{fmtDateTime(String(lastRun.checkedAt))}</dd>
              <dt className="text-slate-500">New alerts</dt><dd className="tnum text-navy">{Number(lastRun.created)}</dd>
              <dt className="text-slate-500">Duplicates skipped</dt><dd className="tnum text-navy">{Number(lastRun.duplicatesSkipped)}</dd>
              <dt className="text-slate-500">Escalated</dt><dd className="tnum text-navy">{Number(lastRun.escalated)}</dd>
            </dl>
          ) : (
            <p className="text-sm text-slate-600">Checks have not been run yet.</p>
          )}
        </Card>
      </div>

      <Card
        title="Alerts"
        bodyClassName="px-0 py-0"
        actions={
          <nav aria-label="Filter alerts" className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={`/alerts?status=${f.key}`}
                aria-current={active(f.key) ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset",
                  active(f.key) ? "bg-navy text-white ring-navy" : "bg-white text-slate-600 ring-slate-300 hover:text-navy",
                )}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="size-5 text-success" aria-hidden />}
            title="No alerts here"
            description={canRun ? "Run monitoring checks to refresh the alerts from the latest records." : "Everything in your scope is on track."}
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-slate-200 bg-canvas">
                <tr>
                  <th className={th}>Alert</th>
                  <th className={th}>Rule</th>
                  <th className={th}>Level</th>
                  <th className={th}>Status</th>
                  <th className={th}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((al) => {
                  const overdue = al.threshold_key === "overdue";
                  const id = Number(al.id);
                  return (
                    <tr key={id} className="align-top">
                      <td className={td}>
                        <div className="flex items-start gap-2">
                          <ShieldAlert className={cn("mt-0.5 size-4 shrink-0", overdue ? "text-crimson" : "text-amber-text")} aria-hidden />
                          <div>
                            <Link href={String(al.link)} className="font-medium text-navy hover:text-cobalt hover:underline">{String(al.entity_label)}</Link>
                            <p className="text-xs text-slate-600">{String(al.message)}</p>
                            <p className="mt-1 text-xs text-slate-500">Deadline {fmtDateTime(al.due_at as Date)} · raised {fmtDateTime(al.created_at as Date)}</p>
                          </div>
                        </div>
                      </td>
                      <td className={td}>
                        <p className="text-navy">{String(al.rule_name)}</p>
                        <Badge tone={overdue ? "danger" : "warning"} className="mt-1">{overdue ? "Overdue" : `Within ${String(al.threshold_key).replace("within-", "")} d`}</Badge>
                      </td>
                      <td className={td}>
                        {Number(al.escalation_count) > 0 ? <Badge tone="danger">Escalated ×{Number(al.escalation_count)}</Badge> : <span className="text-slate-500">Assignee</span>}
                      </td>
                      <td className={td}>
                        <Badge tone={al.status === "resolved" ? "success" : al.status === "acknowledged" ? "info" : "warning"}>{String(al.status)}</Badge>
                        {al.resolution_note ? <p className="mt-1 max-w-[220px] text-xs text-slate-500">{String(al.resolution_note)}</p> : null}
                      </td>
                      <td className={td}>
                        {canUpdate && al.status === "open" ? (
                          <div className="mb-2"><ActionButton action={acknowledgeAlertAction.bind(null, id)} label="Acknowledge" variant="secondary" size="sm" /></div>
                        ) : null}
                        {canUpdate && al.status !== "resolved" ? (
                          <ServerForm action={resolveAlertAction} submit="Resolve" variant="secondary" resetOnSuccess ariaLabel={`Resolve alert ${id}`} className="min-w-[200px]">
                            <input type="hidden" name="alertId" value={id} />
                            <input name="note" required minLength={5} placeholder="Resolution note" className={cn(inputCls, "h-8 text-[13px]")} aria-label="Resolution note" />
                          </ServerForm>
                        ) : null}
                        {!canUpdate || al.status === "resolved" ? <span className="text-xs text-slate-400">No action</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <Card title="Escalation history" description="Each escalation is recorded once per level. Repeated checks never add another entry for the same trigger." className="mt-6" bodyClassName="px-0 py-0">
        {escalations.rows.length === 0 ? (
          <EmptyState icon={<BellRing className="size-5" aria-hidden />} title="No escalations yet" description="Overdue alerts escalate after their configured delay." />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-slate-200 bg-canvas">
                <tr>
                  <th className={th}>When</th>
                  <th className={th}>Alert</th>
                  <th className={th}>Level</th>
                  <th className={th}>Escalated to</th>
                  <th className={th}>Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {escalations.rows.map((e, i) => (
                  <tr key={`${e.alert_id}-${e.level}-${i}`}>
                    <td className={td}>{fmtDateTime(e.created_at)}</td>
                    <td className={td}>{e.entity_label}</td>
                    <td className={td}><Badge tone="danger">Level {e.level}</Badge></td>
                    <td className={td}>{e.to_role === "regional" ? "Regional supervisor" : "Designated administrative authority"}</td>
                    <td className={cn(td, "text-slate-600")}>{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
