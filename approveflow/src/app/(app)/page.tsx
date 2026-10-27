import Link from "next/link";
import { CalendarClock, CheckCircle2, ClipboardList, FileWarning, Inbox, ShieldAlert } from "lucide-react";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { ROLE_LABELS, type Role } from "@/server/permissions";
import { overviewData } from "@/server/services/overview";
import { now } from "@/server/clock";
import { Card, EmptyState, Kpi, PageHeader, SlaBadge, Badge, LinkButton, TableWrap, th, td } from "@/components/ui";
import { AnimatedNumber } from "@/components/animated-number";
import { PendencyChart } from "@/components/pendency-chart";
import { EVC_STATUS_LABELS } from "@/server/services/evc";
import { documentValidity } from "@/server/services/compliance";

export const dynamic = "force-dynamic";

const ROLE_HEADLINE: Record<Role, string> = {
  admin: "National view of approvals, deadlines and alerts.",
  institution: "Your applications, clarification requests and compliance deadlines.",
  regional: "Pendency and overdue work across your region.",
  bureau: "Your scrutiny queue and the cases that need attention.",
  evc: "EVC scheduling, upcoming visits and delayed cases.",
  reviewer: "Cases to re-scrutinise and evidence waiting for review.",
  authority: "Cases waiting for a decision. Decisions are always yours to record.",
  auditor: "Read-only view of pendency, compliance and the audit trail.",
};

export default async function OverviewPage() {
  const actor = (await getCurrentActor())!;
  const db = await getDb();
  const data = await overviewData(db, actor);
  const t = now();
  const k = data.kpis;
  const isInstitution = actor.role === "institution";

  return (
    <>
      <PageHeader
        title={`Welcome, ${actor.name}`}
        description={`${ROLE_LABELS[actor.role]} · ${ROLE_HEADLINE[actor.role]}`}
        actions={
          actor.role === "institution" ? (
            <LinkButton href="/applications/new">New application</LinkButton>
          ) : actor.role === "bureau" ? (
            <LinkButton href="/applications/new">New application</LinkButton>
          ) : null
        }
      />

      <section aria-label="Key figures" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {isInstitution ? (
          <>
            <Kpi label="Awaiting your response" value={<AnimatedNumber value={k.queue} />} href="/applications?status=clarification" tone={k.queue ? "warning" : "neutral"} />
            <Kpi label="Open applications" value={<AnimatedNumber value={k.open} />} href="/applications" tone="info" />
            <Kpi label="Undertakings due in 30 days" value={<AnimatedNumber value={k.undertakingsDue} />} href="/undertakings" tone={k.undertakingsDue ? "warning" : "neutral"} />
            <Kpi label="Documents needing attention" value={<AnimatedNumber value={k.documentsAttention} />} href="/documents" tone={k.documentsAttention ? "danger" : "neutral"} />
          </>
        ) : (
          <>
            <Kpi label={actor.role === "authority" ? "Awaiting decision" : "In your queue"} value={<AnimatedNumber value={k.queue} />} href="/applications?mine=1" tone="info" />
            <Kpi label="Open applications" value={<AnimatedNumber value={k.open} />} href="/applications" />
            <Kpi label="Overdue applications" value={<AnimatedNumber value={k.overdue} />} href="/applications?overdue=1" tone={k.overdue ? "danger" : "neutral"} />
            <Kpi label="Open alerts" value={<AnimatedNumber value={k.openAlerts} />} href="/alerts" tone={k.openAlerts ? "warning" : "neutral"} />
          </>
        )}
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card
            title={isInstitution ? "Clarifications and your open applications" : "Your queue"}
            description={isInstitution ? "Applications the office has returned, or is still reviewing." : "Applications waiting at your stage, most urgent first."}
            actions={<Link href="/applications" className="text-sm font-medium text-cobalt hover:underline">View all</Link>}
            bodyClassName="px-0 py-0"
          >
            {data.queue.length === 0 ? (
              <EmptyState
                icon={<Inbox className="size-5" aria-hidden />}
                title="Nothing waiting for you"
                description="New work appears here as soon as the previous stage is completed."
              />
            ) : (
              <TableWrap>
                <table className="w-full min-w-[560px]">
                  <thead className="border-y border-slate-200 bg-canvas">
                    <tr>
                      <th className={th}>Application</th>
                      <th className={th}>Institution</th>
                      <th className={th}>Stage</th>
                      <th className={th}>Deadline</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.queue.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className={td}>
                          <Link href={`/applications/${a.id}`} className="font-medium text-navy hover:text-cobalt hover:underline">
                            {a.title}
                          </Link>
                          <p className="font-mono text-xs text-slate-500">{a.id}</p>
                        </td>
                        <td className={td}>{a.institution_name}</td>
                        <td className={td}>{a.status === "clarification" ? <Badge tone="warning">Clarification</Badge> : a.stage_name}</td>
                        <td className={td}><SlaBadge dueAt={a.due_at} nowDate={t} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>

          {!isInstitution ? (
            <Card title="Stage-wise pendency" description="Open applications per configured stage, with overdue cases highlighted in red.">
              {data.pendency.length === 0 ? (
                <EmptyState title="No open applications in your scope" />
              ) : (
                <PendencyChart data={data.pendency} />
              )}
            </Card>
          ) : null}

          <Card title="EVC watch" description="Visits that are waiting to be scheduled or are coming up.">
            {data.evcUpcoming.length === 0 ? (
              <EmptyState icon={<CalendarClock className="size-5" aria-hidden />} title="No EVC records in your scope" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.evcUpcoming.map((e) => {
                  const when = (e.scheduled_date as Date | null) ?? (e.target_date as Date);
                  return (
                    <li key={String(e.id)} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <Link href={`/applications/${e.application_id}?tab=evc`} className="font-medium text-navy hover:text-cobalt hover:underline">
                          {String(e.title)}
                        </Link>
                        <p className="text-xs text-slate-500">{String(e.institution_name)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge tone={e.status === "scheduled" ? "info" : "warning"}>{EVC_STATUS_LABELS[String(e.status)]}</Badge>
                        <SlaBadge dueAt={when} nowDate={t} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card
            title="Open alerts"
            description="Most urgent first. Overdue items are escalated automatically."
            actions={<Link href="/alerts" className="text-sm font-medium text-cobalt hover:underline">Open alert centre</Link>}
          >
            {data.alerts.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="size-5 text-success" aria-hidden />} title="No open alerts" description="Everything in your scope is on track." />
            ) : (
              <ul className="space-y-3">
                {data.alerts.map((al) => (
                  <li key={String(al.id)} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start gap-2">
                      <ShieldAlert className={`mt-0.5 size-4 shrink-0 ${al.threshold_key === "overdue" ? "text-crimson" : "text-amber-text"}`} aria-hidden />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-navy">{String(al.entity_label)}</p>
                        <p className="text-xs text-slate-600">{String(al.message)}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <Badge tone={al.threshold_key === "overdue" ? "danger" : "warning"}>
                            {al.threshold_key === "overdue" ? "Overdue" : `Within ${String(al.threshold_key).replace("within-", "")} d`}
                          </Badge>
                          <Link href={String(al.link)} className="text-xs font-medium text-cobalt hover:underline">Open record</Link>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {!isInstitution ? (
            <Card title="Recent activity" description="The latest recorded events in your scope.">
              <ol className="space-y-3">
                {data.events.map((ev) => (
                  <li key={String(ev.id)} className="text-sm">
                    <p className="text-navy">
                      <Link href={`/applications/${ev.application_id}`} className="font-medium hover:text-cobalt hover:underline">
                        {String(ev.application_id)}
                      </Link>{" "}
                      <span className="text-slate-600">{String(ev.detail ?? ev.type)}</span>
                    </p>
                    <p className="text-xs text-slate-500">{String(ev.actor_name ?? "System")} · {new Date(ev.created_at as Date).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                  </li>
                ))}
              </ol>
            </Card>
          ) : (
            <Card title="Your undertakings and documents" description="Items that need action from your institution.">
              <ul className="space-y-3">
                {data.undertakingsDue.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/undertakings/${u.id}`} className="block truncate text-sm font-medium text-navy hover:text-cobalt hover:underline">{u.condition}</Link>
                      <p className="font-mono text-xs text-slate-500">{u.id}</p>
                    </div>
                    <SlaBadge dueAt={u.due_at} nowDate={t} />
                  </li>
                ))}
                {data.docsAttention.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/documents/${d.id}`} className="block truncate text-sm font-medium text-navy hover:text-cobalt hover:underline">{d.title}</Link>
                      <p className="text-xs text-slate-500">{documentValidity(d).label}</p>
                    </div>
                    <FileWarning className="size-4 shrink-0 text-amber-text" aria-hidden />
                  </li>
                ))}
                {data.undertakingsDue.length + data.docsAttention.length === 0 ? (
                  <EmptyState icon={<ClipboardList className="size-5" aria-hidden />} title="Nothing due in the next 30 days" />
                ) : null}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
