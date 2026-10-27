import Link from "next/link";
import { ListChecks } from "lucide-react";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { now } from "@/server/clock";
import { listUndertakings, listDocuments, documentValidity } from "@/server/services/compliance";
import { Badge, Card, EmptyState, PageHeader, SlaBadge, cn } from "@/components/ui";
import { UT_STATUS_LABELS, VALIDITY_TONE } from "@/lib/labels";

export const dynamic = "force-dynamic";

/** Compliance queue: evidence to review, corrections outstanding, overdue undertakings, and renewals awaiting verification. */
export default async function CompliancePage() {
  const actor = (await getCurrentActor())!;
  const db = await getDb();
  const t = now();
  const uts = await listUndertakings(db, actor);
  const docs = (await listDocuments(db, actor)).map((d) => ({ ...d, validity: documentValidity(d) }));

  const toReview = uts.filter((u) => u.status === "submitted");
  const corrections = uts.filter((u) => u.status === "correction_requested");
  const overdue = uts.filter((u) => u.status !== "verified" && u.due_at.getTime() < t.getTime());
  const renewals = docs.filter((d) => d.pending_version_no !== null);
  const expiring = docs.filter((d) => ["expired", "expiring_7", "expiring_30"].includes(d.validity.key));

  return (
    <>
      <PageHeader
        title="Compliance monitoring"
        description="What needs a compliance action now: evidence to verify, corrections outstanding, overdue undertakings, and renewals awaiting verification."
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Tile label="Evidence to verify" value={toReview.length} tone="info" />
        <Tile label="Corrections outstanding" value={corrections.length} tone="danger" />
        <Tile label="Undertakings overdue" value={overdue.length} tone={overdue.length ? "danger" : "neutral"} />
        <Tile label="Renewals to verify" value={renewals.length} tone="info" />
        <Tile label="Documents expiring or expired" value={expiring.length} tone={expiring.length ? "warning" : "neutral"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Evidence awaiting verification" description="A reviewer must accept or return each submission.">
          {toReview.length === 0 && renewals.length === 0 ? (
            <EmptyState icon={<ListChecks className="size-5" aria-hidden />} title="Nothing waiting for verification" />
          ) : (
            <ul className="divide-y divide-line">
              {toReview.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link href={`/undertakings/${u.id}`} className="block truncate text-sm font-medium text-fg hover:text-tea hover:underline">{u.condition}</Link>
                    <p className="text-xs text-fg-3">{u.institution_name} · undertaking {u.id}</p>
                  </div>
                  <Badge tone="info">Undertaking</Badge>
                </li>
              ))}
              {renewals.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link href={`/documents/${d.id}`} className="block truncate text-sm font-medium text-fg hover:text-tea hover:underline">{d.title}</Link>
                    <p className="text-xs text-fg-3">{d.institution_name} · renewal version {d.pending_version_no}</p>
                  </div>
                  <Badge tone="info">Renewal</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Corrections and overdue undertakings" description="Institutions must respond; overdue items are escalated automatically.">
          {corrections.length + overdue.length === 0 ? (
            <EmptyState title="No corrections or overdue undertakings" />
          ) : (
            <ul className="divide-y divide-line">
              {[...new Map([...overdue, ...corrections].map((u) => [u.id, u])).values()].map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link href={`/undertakings/${u.id}`} className="block truncate text-sm font-medium text-fg hover:text-tea hover:underline">{u.condition}</Link>
                    <p className={cn("text-xs", u.status === "correction_requested" ? "text-lilac" : "text-fg-3")}>
                      {UT_STATUS_LABELS[u.status]} · {u.institution_name}
                    </p>
                  </div>
                  <SlaBadge dueAt={u.due_at} decided={u.status === "verified"} nowDate={t} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Document validity" description="Based on the verified copy of each document." className="xl:col-span-2">
          {expiring.length === 0 ? (
            <EmptyState title="No documents expiring within 30 days" />
          ) : (
            <ul className="divide-y divide-line">
              {expiring.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <Link href={`/documents/${d.id}`} className="font-medium text-fg hover:text-tea hover:underline">{d.title}</Link>
                  <Badge tone={VALIDITY_TONE[d.validity.key] ?? "neutral"}>{d.validity.label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function Tile({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "info" | "warning" | "danger" }) {
  return (
    <div className="border-t border-line pt-4">
      <p className={cn("tnum font-display text-[30px] font-light leading-none", ({ neutral: "text-fg", info: "text-sky", warning: "text-lilac", danger: "text-late" } as Record<string, string>)[tone] ?? "text-fg")}>{value}</p>
      <p className="mt-2 text-[13px] text-fg-3">{label}</p>
    </div>
  );
}
