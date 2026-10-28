import Link from "next/link";
import { Check, CheckCircle2 } from "lucide-react";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { now } from "@/server/clock";
import { can, scopeWhere } from "@/server/permissions";
import { listAlerts } from "@/server/services/monitoring";
import { Card, EmptyState, PageHeader, SlaBadge, TableWrap, cn, signalBg, th, td } from "@/components/ui";
import { ActionButton, ServerForm } from "@/components/server-form";
import { Tip } from "@/components/tip";
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
  const t = now();
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
  const active = (k: string) => (sp.status ?? "open") === k;

  return (
    <>
      <PageHeader
        title="Alerts"
        description="One alert per record and threshold. Re-running checks never duplicates. Overdue alerts escalate after each delay and never close or decide a case."
        actions={canRun ? <ActionButton action={runChecksAction} label="Run checks" variant="primary" size="md" /> : null}
      />

      {lastRun ? (
        <p className="-mt-4 mb-10 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-fg-3">
          <span>Last run {fmtDateTime(String(lastRun.checkedAt))}</span>
          <span><span className="text-fg">{Number(lastRun.created)}</span> new</span>
          <span><span className="text-fg">{Number(lastRun.duplicatesSkipped)}</span> duplicates skipped</span>
          <span><span className="text-late">{Number(lastRun.escalated)}</span> escalated</span>
          <span><span className="text-accent">{Number(lastRun.autoResolved)}</span> cleared</span>
        </p>
      ) : null}

      <Card
        bodyClassName="pb-0"
        actions={
          <nav aria-label="Filter alerts" className="flex gap-5 text-sm">
            {FILTERS.map((f) => (
              <Link key={f.key} href={`/alerts?status=${f.key}`} aria-current={active(f.key) ? "page" : undefined} className={cn("pb-1", active(f.key) ? "border-b border-accent text-fg" : "text-fg-3 hover:text-fg")}>
                {f.label}
              </Link>
            ))}
          </nav>
        }
      >
        {rows.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="size-5 text-accent" aria-hidden />} title="Nothing here." />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((al) => {
              const overdue = al.threshold_key === "overdue";
              const id = Number(al.id);
              const esc = Number(al.escalation_count);
              const sig = al.status === "resolved" ? "done" : overdue ? "late" : "soon";
              return (
                <li key={id} className="grid grid-cols-[3px_1fr] gap-x-5 py-4 md:grid-cols-[3px_minmax(0,1fr)_auto_auto_minmax(260px,auto)] md:items-center md:gap-x-8">
                  <span className={cn("row-span-2 h-full min-h-10 md:row-span-1", signalBg(sig))} aria-hidden />
                  <div className="min-w-0">
                    <Link href={String(al.link)} className="block truncate text-sm text-fg hover:text-accent">{String(al.entity_label)}</Link>
                    <Tip label={`${String(al.message)} Raised ${fmtDateTime(al.created_at as Date)}.`}>
                      <span className="block truncate text-xs text-fg-3">{String(al.rule_name)}</span>
                    </Tip>
                  </div>
                  <Tip label={esc ? `Escalated to level ${esc}` : "Not escalated"} className="mt-2 md:mt-0">
                    <span className="flex gap-px" aria-hidden>
                      {[1, 2].map((l) => <span key={l} className={cn("h-4 w-1", l <= esc ? "bg-late" : "bg-line-2")} />)}
                    </span>
                  </Tip>
                  <span className="mt-2 md:mt-0"><SlaBadge dueAt={al.due_at as Date} decided={al.status === "resolved"} nowDate={t} /></span>
                  <div className="col-start-2 mt-3 flex flex-wrap items-center gap-3 md:col-start-auto md:mt-0 md:justify-end">
                    {canUpdate && al.status === "open" ? (
                      <ActionButton action={acknowledgeAlertAction.bind(null, id)} label="Acknowledge" variant="secondary" size="sm" />
                    ) : null}
                    {canUpdate && al.status !== "resolved" ? (
                      <ServerForm action={resolveAlertAction} submit="Resolve" variant="secondary" ariaLabel={`Resolve alert ${id}`} className="flex items-center gap-2 [&>button]:mt-0 [&>button]:h-8 [&>button]:w-auto [&>button]:px-3 [&>button]:text-[13px]">
                        <input type="hidden" name="alertId" value={id} />
                        <input name="note" required minLength={5} placeholder="Note" className="h-8 w-32 border border-line-2 bg-ink-2 px-2 text-[13px] text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none" aria-label="Resolution note" />
                      </ServerForm>
                    ) : null}
                    {al.status === "resolved" ? (
                      <Tip label={String(al.resolution_note ?? "Resolved")}>
                        <span className="inline-flex items-center gap-1.5 text-xs text-fg-3"><Check className="size-3.5 text-accent" aria-hidden />Resolved</span>
                      </Tip>
                    ) : al.status === "acknowledged" && canUpdate ? null : al.status === "acknowledged" ? (
                      <span className="text-xs text-fg-3">Acknowledged</span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Escalation history" className="mt-14" bodyClassName="pb-0">
        {escalations.rows.length === 0 ? (
          <EmptyState title="No escalations yet." />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-line">
                <tr>
                  <th className={th}>Record</th>
                  <th className={th}>Level</th>
                  <th className={th}>Sent to</th>
                  <th className={`${th} text-right`}>When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {escalations.rows.map((e, i) => (
                  <tr key={`${e.alert_id}-${e.level}-${i}`}>
                    <td className={td}>
                      <Tip label={e.reason}><span className="text-fg">{e.entity_label}</span></Tip>
                    </td>
                    <td className={td}>
                      <span className="flex gap-px" aria-label={`Level ${e.level}`}>
                        {[1, 2].map((l) => <span key={l} className={cn("h-4 w-1", l <= e.level ? "bg-late" : "bg-line-2")} />)}
                      </span>
                    </td>
                    <td className={td}>{e.to_role === "regional" ? "Regional supervisor" : "Administrative authority"}</td>
                    <td className={`${td} text-right font-mono text-xs text-fg-3`}>{fmtDateTime(e.created_at)}</td>
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
