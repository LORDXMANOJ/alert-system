import { redirect } from "next/navigation";
import { ScrollText } from "lucide-react";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { can } from "@/server/permissions";
import { Card, EmptyState, PageHeader, TableWrap, inputCls, th, td, buttonClass } from "@/components/ui";
import { fmtDateTime } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; entity?: string; page?: string }> }) {
  const sp = await searchParams;
  const actor = (await getCurrentActor())!;
  if (!can(actor, "audit.view")) redirect("/");
  const db = await getDb();
  const params: unknown[] = [];
  const where: string[] = [];
  if (sp.action) {
    params.push(`%${sp.action}%`);
    where.push(`action ILIKE $${params.length}`);
  }
  if (sp.entity) {
    params.push(sp.entity);
    where.push(`entity_type = $${params.length}`);
  }
  const page = Math.max(1, Number(sp.page) || 1);
  params.push(100, (page - 1) * 100);
  const rows = await db.query<{
    id: number; actor_id: string; actor_role: string; action: string; entity_type: string; entity_id: string | null;
    reason: string | null; meta: string; created_at: Date; actor_name: string | null;
  }>(
    `SELECT a.*, u.name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY a.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Every significant action, with who did it, when, and why. Entries are append-only: the database refuses updates and deletions."
      />
      <Card className="mb-6" bodyClassName="px-5 py-4">
        <form method="get" className="grid gap-3 sm:grid-cols-12" aria-label="Filter audit trail">
          <div className="sm:col-span-5">
            <label htmlFor="action" className="sr-only">Action contains</label>
            <input id="action" name="action" defaultValue={sp.action ?? ""} placeholder="Action, for example stage_completed or report" className={inputCls} />
          </div>
          <div className="sm:col-span-4">
            <label htmlFor="entity" className="sr-only">Entity type</label>
            <select id="entity" name="entity" defaultValue={sp.entity ?? ""} className={inputCls}>
              <option value="">All entity types</option>
              {["application", "evc_record", "undertaking", "document", "alert", "alert_rule", "user", "workflow_stage", "report", "system"].map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3">
            <button type="submit" className={buttonClass("primary", "md", "w-full")}>Filter</button>
          </div>
        </form>
      </Card>

      <Card bodyClassName="px-0 py-0" title="Entries" description={`Page ${page}. Newest first.`}>
        {rows.rows.length === 0 ? (
          <EmptyState icon={<ScrollText className="size-5" aria-hidden />} title="No audit entries match" />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[900px]">
              <thead className="border-b border-line bg-transparent">
                <tr>
                  <th className={th}>When</th>
                  <th className={th}>Actor</th>
                  <th className={th}>Action</th>
                  <th className={th}>Entity</th>
                  <th className={th}>Reason</th>
                  <th className={th}>Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className={td}>{fmtDateTime(r.created_at)}</td>
                    <td className={td}>
                      <p className="text-fg">{r.actor_name ?? r.actor_id}</p>
                      <p className="text-xs text-fg-3">{r.actor_role}</p>
                    </td>
                    <td className={`${td} font-mono text-xs`}>{r.action}</td>
                    <td className={td}>
                      {r.entity_type}
                      {r.entity_id ? <p className="font-mono text-xs text-fg-3">{r.entity_id}</p> : null}
                    </td>
                    <td className={`${td} max-w-xs text-fg-3`}>{r.reason ?? "—"}</td>
                    <td className={td}>
                      <details>
                        <summary className="cursor-pointer text-xs font-medium text-accent">View JSON</summary>
                        <pre className="mt-2 max-w-xs overflow-x-auto bg-transparent p-2 text-[11px] text-fg-2">{JSON.stringify(JSON.parse(r.meta || "{}"), null, 2)}</pre>
                      </details>
                    </td>
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
