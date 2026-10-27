import { redirect } from "next/navigation";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { can, ROLE_LABELS, type Role } from "@/server/permissions";
import { Badge, Card, PageHeader, TableWrap, inputCls, th, td } from "@/components/ui";
import { ServerForm } from "@/components/server-form";
import { updateStageTargetAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function WorkflowConfigPage() {
  const actor = (await getCurrentActor())!;
  if (!can(actor, "admin.manage")) redirect("/");
  const db = await getDb();
  const rows = await db.query<{
    template_id: string; template_name: string; category: string; version: number; stage_id: number; position: number;
    stage_name: string; role: Role; target_days: number; is_evc: boolean; is_decision: boolean; checklist: string;
  }>(
    `SELECT t.id AS template_id, t.name AS template_name, t.category, t.version,
            s.id AS stage_id, s.position, s.name AS stage_name, s.role, s.target_days, s.is_evc, s.is_decision, s.checklist
     FROM workflow_templates t JOIN workflow_stages s ON s.template_id = t.id
     ORDER BY t.category, s.position`,
  );
  const grouped = new Map<string, { name: string; category: string; version: number; stages: typeof rows.rows }>();
  for (const r of rows.rows) {
    const g = grouped.get(r.template_id) ?? { name: r.template_name, category: r.category, version: r.version, stages: [] };
    g.stages.push(r);
    grouped.set(r.template_id, g);
  }

  return (
    <>
      <PageHeader
        title="Workflow configuration"
        description="Each category follows an ordered set of stages. An administrator can change the target duration of a stage. The role that owns a stage and its checklist are fixed in this prototype."
      />
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-soft p-4 text-sm text-amber-text">
        All durations are illustrative defaults. They apply to applications that enter a stage after the change; applications already in progress keep the deadline they were given.
      </div>
      <div className="grid gap-6">
        {[...grouped.entries()].map(([id, g]) => (
          <Card
            key={id}
            title={g.category}
            description={`${g.name} · template version ${g.version}`}
            bodyClassName="px-0 py-0"
          >
            <TableWrap>
              <table className="w-full min-w-[720px]">
                <thead className="border-b border-slate-200 bg-canvas">
                  <tr>
                    <th className={th}>Stage</th>
                    <th className={th}>Owner role</th>
                    <th className={th}>Checklist items</th>
                    <th className={th}>Target (days)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {g.stages.map((s) => (
                    <tr key={s.stage_id} className="align-middle">
                      <td className={td}>
                        <span className="font-medium text-navy">{s.position}. {s.stage_name}</span>
                        <div className="mt-1 flex gap-1">
                          {s.is_evc ? <Badge tone="info">EVC</Badge> : null}
                          {s.is_decision ? <Badge tone="navy">Final decision</Badge> : null}
                        </div>
                      </td>
                      <td className={td}>{ROLE_LABELS[s.role]}</td>
                      <td className={td}>{(JSON.parse(s.checklist) as string[]).length}</td>
                      <td className={td}>
                        <ServerForm action={updateStageTargetAction} submit="Save" variant="secondary" resetOnSuccess={false} className="flex items-center gap-2" ariaLabel={`Target days for ${s.stage_name}`}>
                          <input type="hidden" name="stageId" value={s.stage_id} />
                          <label className="sr-only" htmlFor={`days-${s.stage_id}`}>Target days</label>
                          <input id={`days-${s.stage_id}`} name="targetDays" type="number" min={1} max={365} defaultValue={s.target_days} className={`${inputCls} w-24`} />
                        </ServerForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-500">Each save is recorded in the audit trail. Checklists are defined in the seed data.</p>
    </>
  );
}
