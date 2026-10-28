import Link from "next/link";
import { ClipboardList, Filter } from "lucide-react";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { now } from "@/server/clock";
import { listApplications } from "@/server/services/workflow";
import { ROLE_LABELS, can } from "@/server/permissions";
import { Card, EmptyState, LinkButton, Mark, PageHeader, SlaBadge, TableWrap, deadlineSignal, inputCls, selectCls, th, td, buttonClass } from "@/components/ui";
import { APP_STATUS_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; stage?: string; overdue?: string; mine?: string; page?: string; region?: string }>;
}) {
  const sp = await searchParams;
  const actor = (await getCurrentActor())!;
  const db = await getDb();
  const t = now();

  const stageRole = sp.mine === "1" && actor.role !== "institution" ? actor.role : sp.stage || undefined;
  const all = await listApplications(db, actor, {
    q: sp.q,
    status: sp.status || undefined,
    stageRole,
    overdueOnly: sp.overdue === "1",
    regionId: sp.region || undefined,
    limit: 500,
  });
  const page = Math.max(1, Number(sp.page) || 1);
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const qs = (patch: Record<string, string | undefined>) => {
    const merged = { ...sp, ...patch };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v && k !== "page") params.set(k, v);
    if (patch.page) params.set("page", patch.page);
    const s = params.toString();
    return s ? `/applications?${s}` : "/applications";
  };

  return (
    <>
      <PageHeader
        title="Applications"
       
        actions={
          can(actor, "app.create") ? <LinkButton href="/applications/new">New application</LinkButton> : null
        }
      />

      <Card bodyClassName="px-5 py-4" className="mb-6">
        <form method="get" className="grid gap-3 md:grid-cols-12" role="search" aria-label="Filter applications">
          <div className="md:col-span-4">
            <label htmlFor="q" className="sr-only">Search by ID, title or institution</label>
            <input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Search by ID, title or institution" className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="stage" className="sr-only">Responsible role</label>
            <select id="stage" name="stage" defaultValue={sp.stage ?? ""} className={selectCls}>
              <option value="">All stages</option>
              {["bureau", "reviewer", "evc", "authority"].map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r as keyof typeof ROLE_LABELS]}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="status" className="sr-only">Status</label>
            <select id="status" name="status" defaultValue={sp.status ?? ""} className={selectCls}>
              <option value="">Any status</option>
              {Object.entries(APP_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <label className="flex h-10 items-center gap-2 px-1 text-sm text-fg md:col-span-2">
            <input type="checkbox" name="overdue" value="1" defaultChecked={sp.overdue === "1"} className="size-4 accent-[#083D77]" />
            Overdue only
          </label>
          <div className="flex items-center gap-2 md:col-span-2">
            <button type="submit" className={buttonClass("primary", "md", "w-full")}>
              <Filter className="size-4" aria-hidden />
              Apply
            </button>
          </div>
          {sp.mine === "1" ? <input type="hidden" name="mine" value="1" /> : null}
        </form>
        {sp.mine === "1" || sp.q || sp.stage || sp.status || sp.overdue ? (
          <p className="mt-3 text-sm text-fg-3">
            Showing {all.length} result(s).{" "}
            <Link href="/applications" className="font-medium text-accent hover:underline">Clear filters</Link>
          </p>
        ) : null}
      </Card>

      <Card bodyClassName="px-0 py-0">
        {rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-5" aria-hidden />}
            title="No applications match these filters"
            description="Try another status or stage, or clear the search."
            action={<Link href="/applications" className="text-sm font-medium text-accent hover:underline">Clear filters</Link>}
          />
        ) : (
          <TableWrap>
            <table className="w-full min-w-[860px]">
              <caption className="sr-only">Applications</caption>
              <thead className="border-b border-line">
                <tr>
                  <th scope="col" className={`${th} w-3`}><span className="sr-only">State</span></th>
                  <th scope="col" className={th}>Application</th>
                  <th scope="col" className={th}>Institution</th>
                  <th scope="col" className={th}>Stage</th>
                  <th scope="col" className={`${th} text-right`}>Deadline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((a) => {
                  const sig = a.status === "decided" ? "done" : a.status === "clarification" ? "wait" : deadlineSignal(a.due_at, t).signal;
                  const stateText = a.status === "decided" ? `Decided: ${a.decision ?? ""}` : a.status === "clarification" ? "Waiting for the institution's reply" : APP_STATUS_LABELS[a.status];
                  return (
                    <tr key={a.id} className="group transition-colors hover:bg-ink-2">
                      <td className="py-3 pr-3 align-middle"><Mark signal={sig} label={stateText} size={8} /></td>
                      <td className={td}>
                        <Link href={`/applications/${a.id}`} className="text-fg group-hover:text-accent">{a.title}</Link>
                        <p className="font-mono text-[11px] text-fg-3">{a.id}</p>
                      </td>
                      <td className={td}>
                        <span className="inline-flex items-center gap-2">
                          {a.institution_name}
                          {a.institution_is_new ? <Mark signal="soon" label="New institution" size={6} /> : null}
                        </span>
                        <p className="text-xs text-fg-3">{a.region_name}</p>
                      </td>
                      <td className={td}>
                        {a.status === "decided" ? <span className="text-fg-3">Closed</span> : a.stage_name}
                      </td>
                      <td className={`${td} text-right`}>
                        <SlaBadge dueAt={a.due_at} decided={a.status === "decided"} nowDate={t} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
        {pages > 1 ? (
          <nav aria-label="Pagination" className="flex items-center justify-between border-t border-line px-5 py-3 text-sm">
            <span className="text-fg-3">Page {page} of {pages}</span>
            <div className="flex gap-2">
              {page > 1 ? <Link className={buttonClass("secondary", "sm")} href={qs({ page: String(page - 1) })}>Previous</Link> : null}
              {page < pages ? <Link className={buttonClass("secondary", "sm")} href={qs({ page: String(page + 1) })}>Next</Link> : null}
            </div>
          </nav>
        ) : null}
      </Card>
    </>
  );
}
