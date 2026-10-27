import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { now, daysBetween } from "@/server/clock";
import { listEvcRecords, EVC_STATUS_LABELS } from "@/server/services/evc";
import { Badge, Card, EmptyState, PageHeader, SlaBadge, TableWrap, cn, th, td } from "@/components/ui";
import { fmtDate } from "@/lib/labels";

export const dynamic = "force-dynamic";

const COLUMNS = ["awaiting_scheduling", "scheduling_in_progress", "scheduled", "completed", "report_pending", "follow_up_required", "closed"] as const;
const VIEWS = ["board", "calendar", "list"] as const;
type View = (typeof VIEWS)[number];

export default async function EvcPage({ searchParams }: { searchParams: Promise<{ view?: string; month?: string }> }) {
  const sp = await searchParams;
  const view: View = (VIEWS as readonly string[]).includes(sp.view ?? "") ? (sp.view as View) : "board";
  const actor = (await getCurrentActor())!;
  const db = await getDb();
  const rows = await listEvcRecords(db, actor);
  const t = now();

  const newInstitutions = rows.filter((r) => r.institution_is_new && !["completed", "report_pending", "closed"].includes(r.status)).length;
  const overdue = rows.filter((r) => !["completed", "report_pending", "closed"].includes(r.status) && schedule(r).getTime() < t.getTime()).length;
  const upcoming = rows.filter((r) => r.status === "scheduled" && daysBetween(t, schedule(r)) <= 14 && daysBetween(t, schedule(r)) >= 0).length;

  return (
    <>
      <PageHeader
        title="EVC scheduling"
        description="Applications that need an Expert Visit Committee visit, after their preliminary stages are complete. Overdue visits are escalated automatically."
        actions={
          <nav aria-label="EVC views" className="inline-flex border border-line-2 bg-ink-2 p-0.5 text-sm">
            {VIEWS.map((v) => (
              <Link
                key={v}
                href={`/evc?view=${v}`}
                aria-current={view === v ? "page" : undefined}
                className={cn(" px-3 py-1.5 font-medium capitalize", view === v ? "bg-tea text-ink" : "text-fg-3 hover:text-fg")}
              >
                {v}
              </Link>
            ))}
          </nav>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Records in scope" value={rows.length} />
        <Stat label="New institutions awaiting visit" value={newInstitutions} tone="info" />
        <Stat label="Visits in the next 14 days" value={upcoming} tone="warning" />
        <Stat label="Delayed past target" value={overdue} tone={overdue ? "danger" : "neutral"} />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<CalendarClock className="size-5" aria-hidden />} title="No EVC records in your scope" description="An application appears here once it reaches an EVC stage." />
      ) : view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2">
          <div className="grid min-w-max grid-flow-col auto-cols-[250px] gap-6">
            {COLUMNS.map((col) => {
              const items = rows.filter((r) => r.status === col);
              return (
                <section key={col} aria-label={EVC_STATUS_LABELS[col]} className="flex flex-col border-t border-line">
                  <header className="flex items-center justify-between py-3">
                    <h2 className="text-sm font-semibold text-fg">{EVC_STATUS_LABELS[col]}</h2>
                    <span className="tnum font-mono text-xs text-fg-3">{items.length}</span>
                  </header>
                  <ul className="flex flex-1 flex-col divide-y divide-line">
                    {items.length === 0 ? <li className="px-1 py-6 text-center text-xs text-fg-3">Nothing here</li> : null}
                    {items.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={`/applications/${r.application_id}?tab=evc`}
                          className="group block py-3.5 transition-colors hover:bg-ink-2"
                        >
                          <p className="line-clamp-2 text-sm font-medium text-fg">{r.application_title}</p>
                          <p className="mt-0.5 text-xs text-fg-3">{r.institution_name}</p>
                          <p className="font-mono text-[11px] text-fg-3">{r.application_id}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                                        <SlaBadge dueAt={schedule(r)} decided={col === "completed" || col === "closed" || col === "report_pending"} nowDate={t} />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      ) : view === "calendar" ? (
        <CalendarView rows={rows} now={t} monthParam={sp.month} />
      ) : (
        <Card bodyClassName="px-0 py-0">
          <TableWrap>
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-line bg-transparent">
                <tr>
                  <th className={th}>Application</th>
                  <th className={th}>Institution</th>
                  <th className={th}>Status</th>
                  <th className={th}>Target</th>
                  <th className={th}>Scheduled</th>
                  <th className={th}>Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-ink-2">
                    <td className={td}>
                      <Link href={`/applications/${r.application_id}?tab=evc`} className="font-medium text-fg hover:text-tea hover:underline">{r.application_title}</Link>
                      <p className="font-mono text-xs text-fg-3">{r.application_id}</p>
                    </td>
                    <td className={td}>{r.institution_name}{r.institution_is_new ? <Badge tone="info" className="ml-2">New</Badge> : null}</td>
                    <td className={td}><Badge tone={r.status === "scheduled" ? "info" : ["completed", "closed", "report_pending"].includes(r.status) ? "success" : "warning"}>{EVC_STATUS_LABELS[r.status]}</Badge></td>
                    <td className={td}>{fmtDate(r.target_date)}</td>
                    <td className={td}>{fmtDate(r.scheduled_date)}</td>
                    <td className={td}>{fmtDate(r.completed_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}
    </>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "info" | "warning" | "danger" }) {
  return (
    <div className="border-t border-line pt-4">
      <p className={cn("tnum font-display text-[30px] font-light leading-none", ({ neutral: "text-fg", info: "text-sky", warning: "text-lilac", danger: "text-late" } as Record<string, string>)[tone] ?? "text-fg")}>{value}</p>
      <p className="mt-2 text-[13px] text-fg-3">{label}</p>
    </div>
  );
}

type Row = Awaited<ReturnType<typeof listEvcRecords>>[number];

/** The date that matters for an EVC record: the visit date once scheduled, otherwise the target date. */
function schedule(r: Row): Date {
  return r.scheduled_date ? new Date(r.scheduled_date) : new Date(r.target_date);
}

function CalendarView({ rows, now: t, monthParam }: { rows: Row[]; now: Date; monthParam?: string }) {
  const base = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? new Date(`${monthParam}-01T00:00:00`) : new Date(t.getFullYear(), t.getMonth(), 1);
  const year = base.getFullYear();
  const month = base.getMonth();
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // weeks start on Monday
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const byDay = new Map<number, Row[]>();
  for (const r of rows) {
    const d = schedule(r);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const list = byDay.get(d.getDate()) ?? [];
      list.push(r);
      byDay.set(d.getDate(), list);
    }
  }
  const prev = new Date(year, month - 1, 1);
  const next = new Date(year, month + 1, 1);
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const monthName = first.toLocaleString("en-IN", { month: "long", year: "numeric" });

  return (
    <Card
      title={monthName}
      description="Scheduled visits and target dates. Select an entry to open the application's EVC history."
      actions={
        <div className="flex items-center gap-2">
          <Link href={`/evc?view=calendar&month=${key(prev)}`} className="border border-line-2 px-2.5 py-1 text-sm hover:bg-ink-2">Previous</Link>
          <Link href={`/evc?view=calendar&month=${key(new Date())}`} className="border border-line-2 px-2.5 py-1 text-sm hover:bg-ink-2">Today</Link>
          <Link href={`/evc?view=calendar&month=${key(next)}`} className="border border-line-2 px-2.5 py-1 text-sm hover:bg-ink-2">Next</Link>
        </div>
      }
    >
      <div className="grid grid-cols-7 gap-px overflow-hidden border border-line bg-line-2 text-xs">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="bg-ink-2 px-2 py-1.5 text-center font-semibold text-fg-3">{d}</div>
        ))}
        {cells.map((day, i) => {
          const items = day ? byDay.get(day) ?? [] : [];
          const isToday = day !== null && year === t.getFullYear() && month === t.getMonth() && day === t.getDate();
          return (
            <div key={i} className={cn("min-h-24 bg-ink-2 p-1.5", !day && "bg-ink-2")}>
              {day ? (
                <>
                  <p className={cn("tnum mb-1 inline-flex size-6 items-center justify-center  font-medium", isToday ? "bg-tea text-ink" : "text-fg-3")}>{day}</p>
                  <ul className="space-y-1">
                    {items.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={`/applications/${r.application_id}?tab=evc`}
                          className={cn(
                            "block truncate  px-1.5 py-0.5 text-[11px] font-medium ring-inset",
                            r.status === "scheduled" ? "bg-ink-3 text-tea" : "bg-ink-3 text-lilac",
                          )}
                          title={`${r.application_title} · ${EVC_STATUS_LABELS[r.status]}`}
                        >
                          {r.application_id}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-fg-3">Blue entries are scheduled visits. Amber entries are target dates for visits not yet scheduled.</p>
    </Card>
  );
}
