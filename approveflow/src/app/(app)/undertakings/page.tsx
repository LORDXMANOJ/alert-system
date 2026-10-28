import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { now } from "@/server/clock";
import { listUndertakings } from "@/server/services/compliance";
import { Badge, Card, EmptyState, LinkButton, PageHeader, SlaBadge, TableWrap, th, td } from "@/components/ui";
import { UT_STATUS_LABELS } from "@/lib/labels";
import { can } from "@/server/permissions";

export const dynamic = "force-dynamic";

export default async function UndertakingsPage() {
  const actor = (await getCurrentActor())!;
  const db = await getDb();
  const rows = await listUndertakings(db, actor);
  const t = now();

  return (
    <>
      <PageHeader
        title="Institutional undertakings"
        description="Time-bound conditions attached to approvals. Evidence is verified only when a reviewer accepts it, never by the submission itself."
        actions={can(actor, "ut.create") ? <LinkButton href="/applications" variant="secondary">Add from an application</LinkButton> : null}
      />
      <Card bodyClassName="px-0 py-0">
        {rows.length === 0 ? (
          <EmptyState icon={<FileCheck2 className="size-5" aria-hidden />} title="No undertakings in your scope" description="Undertakings are recorded from an application's detail page." />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-line bg-transparent">
                <tr>
                  <th className={th}>Undertaking</th>
                  <th className={th}>Institution</th>
                  <th className={th}>Status</th>
                  <th className={th}>Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((u) => (
                  <tr key={u.id} className="hover:bg-ink-2">
                    <td className={td}>
                      <Link href={`/undertakings/${u.id}`} className="font-medium text-fg hover:text-accent hover:underline">{u.condition}</Link>
                      <p className="font-mono text-xs text-fg-3">{u.id} · {u.application_id}</p>
                    </td>
                    <td className={td}>{u.institution_name}</td>
                    <td className={td}>
                      <Badge tone={u.status === "verified" ? "success" : u.status === "correction_requested" ? "danger" : u.status === "submitted" ? "info" : "neutral"}>
                        {UT_STATUS_LABELS[u.status]}
                      </Badge>
                    </td>
                    <td className={td}><SlaBadge dueAt={u.due_at} decided={u.status === "verified"} nowDate={t} /></td>
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
