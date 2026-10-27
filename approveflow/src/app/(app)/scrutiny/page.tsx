import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { now } from "@/server/clock";
import { listApplications, isOverdue, type ApplicationRow } from "@/server/services/workflow";
import { Badge, Card, EmptyState, PageHeader, SlaBadge, th, td, TableWrap } from "@/components/ui";
import { ROLE_LABELS } from "@/server/permissions";

export const dynamic = "force-dynamic";

/**
 * Scrutiny workspace. Scrutiny is the Bureau stage. Re-scrutiny and committee review are the Reviewer stage.
 * The checklist is confirmed on the application itself, so every stage keeps one record of its checks.
 */
export default async function ScrutinyPage() {
  const actor = (await getCurrentActor())!;
  const db = await getDb();
  const t = now();

  const bureau = await listApplications(db, actor, { stageRole: "bureau", status: "in_progress", limit: 200 });
  const reviewer = await listApplications(db, actor, { stageRole: "reviewer", status: "in_progress", limit: 200 });
  const clarifications = await listApplications(db, actor, { status: "clarification", limit: 200 });

  const mine = actor.role === "bureau" ? bureau : actor.role === "reviewer" ? reviewer : [...bureau, ...reviewer];

  return (
    <>
      <PageHeader
        title="Scrutiny & re-scrutiny"
        description="The queue of applications waiting for scrutiny or re-scrutiny. Open an application to confirm the checklist, record observations and move it on."
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Queue title="Scrutiny queue" description="Bureau stage: checklist, missing documents, discrepancies." rows={bureau} now={t} empty="No applications are waiting for scrutiny." />
          <Queue
            title="Re-scrutiny and committee review"
            description="Reviewer stage: previous observations addressed and corrections verified."
            rows={reviewer}
            now={t}
            empty="No applications are waiting for re-scrutiny."
          />
        </div>
        <div className="space-y-6">
          <Card title="Returned for clarification" description="Waiting for the institution to respond.">
            {clarifications.length === 0 ? (
              <EmptyState title="No clarifications outstanding" />
            ) : (
              <ul className="divide-y divide-line">
                {clarifications.slice(0, 8).map((a) => (
                  <li key={a.id} className="py-2.5">
                    <Link href={`/applications/${a.id}`} className="text-sm font-medium text-fg hover:text-tea hover:underline">{a.id}</Link>
                    <p className="line-clamp-2 text-xs text-fg-3">{a.clarification_reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Your responsibilities" description={`Signed in as ${ROLE_LABELS[actor.role]}.`}>
            <ul className="list-disc space-y-2 pl-5 text-sm text-fg-3">
              <li>Scrutiny confirms the record; it does not approve or reject by itself.</li>
              <li>Missing or discrepant items are returned with a reason that is kept in the history.</li>
              <li>Overdue stages are flagged and escalated automatically. Escalation never decides the case.</li>
            </ul>
            <p className="mt-3 text-xs text-fg-3">{mine.length} item(s) in your queues.</p>
          </Card>
        </div>
      </div>
    </>
  );
}

function Queue({ title, description, rows, now: t, empty }: { title: string; description: string; rows: ApplicationRow[]; now: Date; empty: string }) {
  return (
    <Card title={title} description={description} bodyClassName="px-0 py-0">
      {rows.length === 0 ? (
        <EmptyState icon={<ClipboardCheck className="size-5" aria-hidden />} title={empty} />
      ) : (
        <TableWrap>
          <table className="w-full min-w-[620px]">
            <thead className="border-b border-line bg-transparent">
              <tr>
                <th className={th}>Application</th>
                <th className={th}>Institution</th>
                <th className={th}>Flags</th>
                <th className={th}>Deadline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((a) => (
                <tr key={a.id} className={isOverdue(a) ? "bg-late/5" : "hover:bg-ink-2"}>
                  <td className={td}>
                    <Link href={`/applications/${a.id}`} className="font-medium text-fg hover:text-tea hover:underline">{a.title}</Link>
                    <p className="font-mono text-xs text-fg-3">{a.id} · {a.stage_name}</p>
                  </td>
                  <td className={td}>{a.institution_name}</td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-1">
                      {a.priority === "high" ? <Badge tone="danger">High priority</Badge> : null}
                      {a.institution_is_new ? <Badge tone="info">New institution</Badge> : null}
                      {a.is_evc ? <Badge tone="neutral">EVC follows</Badge> : null}
                    </div>
                  </td>
                  <td className={td}><SlaBadge dueAt={a.due_at} nowDate={t} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
    </Card>
  );
}
