import Link from "next/link";
import { Download } from "lucide-react";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { can, ROLE_LABELS } from "@/server/permissions";
import { REPORT_TYPES, buildReport, type ReportId } from "@/server/services/reports";
import { Card, EmptyState, PageHeader, TableWrap, buttonClass, cn, selectCls, th, td, Badge } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { PendencyChart } from "@/components/pendency-chart";
import { fmtDate, fmtDateTime } from "@/lib/labels";

export const dynamic = "force-dynamic";

const ALL_IDS = REPORT_TYPES.map((r) => r.id) as ReportId[];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; region?: string; stage?: string }>;
}) {
  const sp = await searchParams;
  const actor = (await getCurrentActor())!;
  if (!can(actor, "report.export")) {
    return (
      <>
        <PageHeader title="Reports & analytics" />
        <EmptyState title="Reports are not available for your role" description="Ask a regional officer, administrator or auditor to share the figures you need." />
      </>
    );
  }
  const db = await getDb();
  const reportId: ReportId = (ALL_IDS as string[]).includes(sp.report ?? "") ? (sp.report as ReportId) : "pendency";
  const filters = { regionId: sp.region || undefined, stageRole: sp.stage || undefined };
  const report = await buildReport(db, actor, reportId, filters);
  const regions = await db.query<{ id: string; name: string }>("SELECT id, name FROM regions ORDER BY name");
  const def = REPORT_TYPES.find((r) => r.id === reportId)!;
  const exportHref = `/api/export/${reportId}?${new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString()}`;
  const total = report.rows.length;

  return (
    <>
      <PageHeader
        title="Reports & analytics"
        description="Authorized views of approvals, EVC, compliance and document validity. Every export is recorded in the audit trail."
        actions={
          <>
            <PrintButton />
            {can(actor, "report.export") && (reportId !== "audit" || can(actor, "audit.view")) ? (
              <a href={exportHref} className={buttonClass("primary", "sm")}>
                <Download className="size-4" aria-hidden />
                Export CSV
              </a>
            ) : null}
          </>
        }
      />

      <nav aria-label="Report types" className="mb-5 flex gap-1.5 overflow-x-auto pb-1">
        {REPORT_TYPES.filter((r) => r.id !== "audit" || can(actor, "audit.view")).map((r) => (
          <Link
            key={r.id}
            href={`/reports?report=${r.id}${filters.regionId ? `&region=${filters.regionId}` : ""}${filters.stageRole ? `&stage=${filters.stageRole}` : ""}`}
            aria-current={reportId === r.id ? "page" : undefined}
            className={cn(
              "whitespace-nowrap  px-3 py-1.5 text-sm font-medium ring-inset",
              reportId === r.id ? "text-accent" : "text-fg-3 hover:text-fg",
            )}
          >
            {r.label}
          </Link>
        ))}
      </nav>

      <Card className="mb-6" bodyClassName="px-5 py-4">
        <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Report filters">
          <input type="hidden" name="report" value={reportId} />
          <label className="flex min-w-[180px] flex-col gap-1 text-sm text-fg">
            Region
            <select name="region" defaultValue={sp.region ?? ""} className={selectCls}>
              <option value="">All regions</option>
              {regions.rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="flex min-w-[180px] flex-col gap-1 text-sm text-fg">
            Responsible role
            <select name="stage" defaultValue={sp.stage ?? ""} className={selectCls}>
              <option value="">All roles</option>
              {(["bureau", "reviewer", "evc", "authority"] as const).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </label>
          <button type="submit" className={buttonClass("secondary", "md")}>Apply filters</button>
          <p className="ml-auto text-sm text-fg-3">
            <span className="font-medium text-fg">{def.label}</span> · {total} row(s){total ? "" : ""}
          </p>
        </form>
        <p className="mt-2 text-xs text-fg-3">{def.description} Figures reflect only the records you are allowed to see.</p>
      </Card>

      {reportId === "pendency" && report.rows.length > 0 ? (
        <Card title="Pendency at a glance" className="mb-6">
          <PendencyChart data={report.rows.map((r) => ({ stage: String(r.stage), open: Number(r.open), overdue: Number(r.overdue) }))} />
        </Card>
      ) : null}

      <Card bodyClassName="px-0 py-0" title={def.label} description={`Generated ${fmtDateTime(new Date())}`}>
        {report.rows.length === 0 ? (
          <EmptyState title="No rows for these filters" description="Clear the filters to see everything in your scope." />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-line bg-transparent">
                <tr>
                  {report.columns.map((c) => <th key={c} className={th}>{c.replace(/_/g, " ")}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-ink-2">
                    {report.columns.map((c) => {
                      const v = row[c];
                      const isDate = v instanceof Date;
                      const isOverdue = (c === "overdue" && v === "yes") || (c === "overdue" && Number(v) > 0);
                      return (
                        <td key={c} className={cn(td, "tnum")}>
                          {isDate ? fmtDate(v as Date) : isOverdue ? <Badge tone="danger">{String(v)}</Badge> : v === null || v === undefined || v === "" ? "—" : String(v)}
                        </td>
                      );
                    })}
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
