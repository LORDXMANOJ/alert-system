import { redirect } from "next/navigation";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { can } from "@/server/permissions";
import { getClockOffsetDays, now } from "@/server/clock";
import { Badge, Card, PageHeader, TableWrap, th, td } from "@/components/ui";
import { ActionButton, ServerForm } from "@/components/server-form";
import { resetDemoAction, shiftClockAction, toggleRuleAction } from "@/app/actions";
import { fmtDate } from "@/lib/labels";

export const dynamic = "force-dynamic";

const ROLE_NAME: Record<string, string> = {
  bureau: "Bureau officer",
  evc: "EVC coordinator",
  reviewer: "Committee reviewer",
  authority: "Competent authority",
  regional: "Regional officer",
  admin: "Administrator",
  institution: "Institution user",
};

export default async function SettingsPage() {
  const actor = (await getCurrentActor())!;
  if (!can(actor, "admin.manage")) redirect("/");
  const db = await getDb();
  const rules = await db.query<{
    id: string; name: string; description: string; thresholds_days: string; severity: string;
    responsible_role: string; escalation_delay_days: number; enabled: boolean;
  }>("SELECT * FROM alert_rules ORDER BY id");
  const offset = getClockOffsetDays();

  return (
    <>
      <PageHeader
        title="System settings"
        description="Demonstration clock, alert rules and demo controls. Every default is illustrative and configurable."
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Demonstration clock" description="Shift the clock to show what happens as deadlines pass. Then run monitoring checks from Tasks & escalations." className="xl:col-span-1">
          <p className="text-sm text-slate-600">Current demo date</p>
          <p className="tnum mt-1 text-2xl font-semibold text-navy">{fmtDate(now())}</p>
          <p className="mt-1 text-sm text-slate-600">
            {offset === 0 ? "Running on the real date." : `Shifted by ${offset > 0 ? "+" : ""}${offset} day(s).`}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {[1, 7, 10, 30].map((d) => (
              <ActionButton key={d} action={shiftClockAction.bind(null, d)} label={`+${d} day${d > 1 ? "s" : ""}`} variant="secondary" size="sm" />
            ))}
            <ActionButton action={shiftClockAction.bind(null, -7)} label="−7 days" variant="secondary" size="sm" />
          </div>
        </Card>

        <Card title="Reset demonstration data" description="Restores the starting records and the real clock. Use before a live walkthrough." className="xl:col-span-1">
          <p className="text-sm text-slate-600">All records, alerts, escalations and history return to the seeded state. This also clears the audit log, so use it deliberately.</p>
          <div className="mt-5">
            <ActionButton
              action={resetDemoAction}
              label="Reset demo data"
              variant="danger"
              size="md"
              confirm={{ title: "Reset all demonstration data?", body: "Every change made during this session will be removed and the seeded records restored.", confirmLabel: "Reset data" }}
            />
          </div>
        </Card>

        <Card title="Integrations" description="No live government system is connected." className="xl:col-span-1">
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between gap-2"><span>AICTE application systems</span><Badge tone="neutral">Not connected</Badge></li>
            <li className="flex items-center justify-between gap-2"><span>Email notifications</span><Badge tone="neutral">Not configured</Badge></li>
            <li className="flex items-center justify-between gap-2"><span>SMS notifications</span><Badge tone="neutral">Not configured</Badge></li>
            <li className="flex items-center justify-between gap-2"><span>In-app notifications</span><Badge tone="success">Active</Badge></li>
          </ul>
        </Card>
      </div>

      <Card className="mt-6" title="Alert rules" description="Thresholds are days before a deadline. A rule that is switched off raises no new alerts." bodyClassName="px-0 py-0">
        <TableWrap>
          <table className="w-full min-w-[900px]">
            <thead className="border-b border-slate-200 bg-canvas">
              <tr>
                <th className={th}>Rule</th>
                <th className={th}>Warn before (days)</th>
                <th className={th}>Severity</th>
                <th className={th}>Escalation delay</th>
                <th className={th}>Responsible</th>
                <th className={th}>Enabled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rules.rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className={td}>
                    <p className="font-medium text-navy">{r.name}</p>
                    <p className="max-w-md text-xs text-slate-600">{r.description}</p>
                    <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-amber-text">Illustrative defaults</p>
                  </td>
                  <td className={`${td} tnum`}>{r.thresholds_days.split(",").join(", ")}</td>
                  <td className={td}><Badge tone={r.severity === "warning" ? "warning" : r.severity === "info" ? "info" : "danger"}>{r.severity}</Badge></td>
                  <td className={`${td} tnum`}>{r.escalation_delay_days} day(s) per level</td>
                  <td className={td}>{ROLE_NAME[r.responsible_role] ?? r.responsible_role}</td>
                  <td className={td}>
                    <ServerForm action={toggleRuleAction} submit={r.enabled ? "Disable" : "Enable"} variant="secondary" resetOnSuccess={false} className="flex flex-col items-start gap-1" ariaLabel={`${r.enabled ? "Disable" : "Enable"} ${r.name}`}>
                      <input type="hidden" name="ruleId" value={r.id} />
                      <input type="hidden" name="enabled" value={String(!r.enabled)} />
                    </ServerForm>
                    <span className="sr-only">{r.enabled ? "Enabled" : "Disabled"}</span>
                    <p className="mt-1 text-xs text-slate-500">{r.enabled ? "On" : "Off"}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>

      <p className="mt-6 text-xs text-slate-500">
        <strong className="font-medium text-navy">Escalation path:</strong> assignee → regional supervisor → designated administrative authority. Escalation informs the next level. It never approves, rejects or closes a case.
      </p>
    </>
  );
}
