import Link from "next/link";
import { FileText } from "lucide-react";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { can } from "@/server/permissions";
import { DOC_CATEGORIES, documentValidity, listDocuments } from "@/server/services/compliance";
import { Badge, Card, EmptyState, Field, PageHeader, TableWrap, ValidityBar, inputCls, selectCls, th, td, cn } from "@/components/ui";
import { ServerForm } from "@/components/server-form";
import { createDocumentAction } from "@/app/actions";
import { VALIDITY_TONE, fmtDate } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const actor = (await getCurrentActor())!;
  const db = await getDb();
  const docs = (await listDocuments(db, actor)).map((d) => ({ ...d, validity: documentValidity(d) }));
  const counts = {
    expired: docs.filter((d) => d.validity.key === "expired").length,
    soon: docs.filter((d) => ["expiring_7", "expiring_30"].includes(d.validity.key)).length,
    review: docs.filter((d) => d.validity.key === "renewal_review").length,
  };

  return (
    <>
      <PageHeader
        title="Lease & document validity"
        description="Prescribed documents with their validity. Renewals are added as new versions. The previous version always stays in the history."
      />
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Stat label="Expired" value={counts.expired} tone="danger" />
        <Stat label="Expiring within 30 days" value={counts.soon} tone="warning" />
        <Stat label="Renewals under review" value={counts.review} tone="info" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Document register" className="xl:col-span-2" bodyClassName="px-0 py-0">
          {docs.length === 0 ? (
            <EmptyState icon={<FileText className="size-5" aria-hidden />} title="No documents in your scope" />
          ) : (
            <TableWrap>
              <table className="w-full min-w-[640px]">
                <thead className="border-b border-line bg-transparent">
                  <tr>
                    <th className={th}>Document</th>
                    <th className={th}>Institution</th>
                    <th className={th}>Validity</th>
                    <th className={th}>Expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {docs.map((d) => (
                    <tr key={d.id} className="hover:bg-ink-2">
                      <td className={td}>
                        <Link href={`/documents/${d.id}`} className="font-medium text-fg hover:text-accent hover:underline">{d.title}</Link>
                        <p className="font-mono text-xs text-fg-3">{d.id} · {d.category}</p>
                      </td>
                      <td className={td}>{d.institution_name}</td>
                      <td className={cn(td, "min-w-[180px]")}>
                        <Badge tone={VALIDITY_TONE[d.validity.key] ?? "neutral"}>{d.validity.label}</Badge>
                        <div className="mt-2 max-w-[160px]"><ValidityBar days={d.validity.days} /></div>
                      </td>
                      <td className={cn(td, "whitespace-nowrap")}>{fmtDate(d.current_expires_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>

        {can(actor, "doc.upload") ? (
          <Card title="Upload a document" description="A new document waits for a reviewer before it counts as verified.">
            <ServerForm action={createDocumentAction} submit="Upload document" ariaLabel="Upload document">
              <div className="space-y-4">
                <Field label="Document name" htmlFor="title">
                  <input id="title" name="title" required minLength={3} className={inputCls} placeholder="For example: Campus lease deed (Block B)" />
                </Field>
                <Field label="Category" htmlFor="category">
                  <select id="category" name="category" required className={selectCls}>
                    {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Expiry or validity date" htmlFor="expiresOn">
                  <input id="expiresOn" name="expiresOn" type="date" required className={inputCls} />
                </Field>
                <Field label="File" htmlFor="file" hint="PDF, PNG or JPG, up to 10 MB.">
                  <input id="file" name="file" type="file" required accept="application/pdf,image/png,image/jpeg" className={cn(inputCls, "h-auto py-2 file:mr-3 file: file:border-0 file:bg-ink-3 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent")} />
                </Field>
              </div>
            </ServerForm>
          </Card>
        ) : (
          <Card title="About validity">
            <p className="text-sm text-fg-3">Reminders are sent at 30, 15, 7 and 0 days before expiry (configurable). A renewal is verified only after a reviewer accepts it.</p>
          </Card>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "danger" | "warning" | "info" }) {
  return (
    <div className="border-t border-line pt-4">
      <p className={cn("tnum font-display text-[30px] font-light leading-none", ({ neutral: "text-fg", info: "text-sky", warning: "text-amber", danger: "text-late" } as Record<string, string>)[tone] ?? "text-fg")}>{value}</p>
      <p className="mt-2 text-[13px] text-fg-3">{label}</p>
    </div>
  );
}
