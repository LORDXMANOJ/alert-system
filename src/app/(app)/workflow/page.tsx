import Link from "next/link";
import { Workflow } from "lucide-react";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { now } from "@/server/clock";
import { scopeWhere } from "@/server/permissions";
import { Card, EmptyState, PageHeader, TableWrap, Badge, th, td } from "@/components/ui";
import { ROLE_LABELS, type Role } from "@/server/permissions";

export const dynamic = "force-dynamic";

/** Stage-by-stage pipeline: how many open applications sit at each configured stage, and how many are overdue. */
export default async function WorkflowPage() {
  const actor = (await getCurrentActor())!;
  const db = await getDb();
  const scope = scopeWhere(actor, { institution: "a.institution_id", region: "a.region_id" }, 1);
  const t = now();
  const res = await db.query<{
    template_id: string; template_name: string; category: string; position: number; stage_name: string; role: Role;
    target_days: number; is_evc: boolean; is_decision: boolean; open_count: number; overdue_count: number;
  }>(
    `SELECT t.id AS template_id, t.name AS template_name, t.category, s.position, s.name AS stage_name, s.role,
            s.target_days, s.is_evc, s.is_decision,
            (SELECT COUNT(*)::int FROM applications a WHERE a.template_id = s.template_id AND a.stage_position = s.position
               AND a.status <> 'decided' AND ${scope.sql}) AS open_count,
            (SELECT COUNT(*)::int FROM applications a WHERE a.template_id = s.template_id AND a.stage_position = s.position
               AND a.status <> 'decided' AND a.due_at < $${scope.params.length + 1} AND ${scope.sql}) AS overdue_count
     FROM workflow_stages s JOIN workflow_templates t ON t.id = s.template_id
     ORDER BY t.category, s.position`,
    [...scope.params, t],
  );

  const byTemplate = new Map<string, { name: string; category: string; stages: typeof res.rows }>();
  for (const r of res.rows) {
    const g = byTemplate.get(r.template_id) ?? { name: r.template_name, category: r.category, stages: [] };
    g.stages.push(r);
    byTemplate.set(r.template_id, g);
  }

  return (
    <>
      <PageHeader
        title="Workflow management"
        description="Every configured route, with the number of open and overdue applications at each stage. Select a stage to see its queue."
      />
      {byTemplate.size === 0 ? (
        <EmptyState icon={<Workflow className="size-5" aria-hidden />} title="No workflows configured" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {[...byTemplate.entries()].map(([id, g]) => (
            <Card key={id} title={g.category} description={g.name}>
              <TableWrap>
                <table className="w-full min-w-[420px]">
                  <thead className="border-b border-line bg-transparent">
                    <tr>
                      <th className={th}>Stage</th>
                      <th className={th}>Role</th>
                      <th className={th}>Open</th>
                      <th className={th}>Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {g.stages.map((s) => (
                      <tr key={s.position}>
                        <td className={td}>
                          <span className="font-medium text-fg">{s.position}. {s.stage_name}</span>
                          <p className="text-xs text-fg-3">{s.target_days}-day target{s.is_evc ? " · EVC" : ""}{s.is_decision ? " · final" : ""}</p>
                        </td>
                        <td className={td}>{ROLE_LABELS[s.role]}</td>
                        <td className={td}>
                          <Link href={`/applications?stage=${s.role}`} className="tnum font-medium text-accent hover:underline">{s.open_count}</Link>
                        </td>
                        <td className={td}>
                          {s.overdue_count > 0 ? <Badge tone="danger">{s.overdue_count}</Badge> : <span className="tnum text-fg-3">0</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
