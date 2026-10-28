import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { overviewData } from "@/server/services/overview";
import { documentValidity } from "@/server/services/compliance";
import { now } from "@/server/clock";
import { Card, LinkButton, SlaBadge, ValidityBar, cn, deadlineSignal, signalBg } from "@/components/ui";
import { Tip } from "@/components/tip";
import { UT_STATUS_LABELS } from "@/lib/labels";
import towers from "../../../public/images/towers.jpg";
import campus from "../../../public/images/campus.jpg";

export const dynamic = "force-dynamic";

const STAGE_ROLE_LINK: Record<string, string> = { bureau: "bureau", reviewer: "reviewer", evc: "evc", authority: "authority" };

export default async function OverviewPage() {
  const actor = (await getCurrentActor())!;
  const db = await getDb();
  const data = await overviewData(db, actor);
  const t = now();
  const k = data.kpis;

  if (actor.role === "institution") return <InstitutionHome data={data} t={t} />;

  const total = Math.max(1, data.flow.reduce((s, f) => s + f.total, 0));
  const maxDay = Math.max(1, ...data.activity.map((a) => a.n));
  const maxRegion = Math.max(1, ...data.regions.map((r) => r.open));

  return (
    <div className="space-y-14">
      {/* Headline as a sentence: the state of the day, numbers coloured by meaning */}
      <section className="flex flex-wrap items-end justify-between gap-6">
        <h1 className="max-w-3xl font-display text-[30px] font-light leading-[1.2] tracking-[-0.02em] text-fg sm:text-[40px]">
          <Link href="/applications" className="text-fg hover:text-accent">{k.open} open</Link>
          <span className="text-fg-3">, </span>
          <Link href="/applications?overdue=1" className={k.overdue ? "text-late hover:underline" : "text-fg"}>{k.overdue} overdue</Link>
          <span className="text-fg-3">, </span>
          <Link href="/alerts" className={k.openAlerts ? "text-amber hover:underline" : "text-fg"}>{k.openAlerts} alerts</Link>
          <span className="text-fg-3">.</span>
        </h1>
        <p className="font-mono text-xs text-fg-3">{t.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
      </section>

      {/* The flow: every stage, sized by open cases, coloured by health */}
      <section aria-label="Applications by stage">
        <div className="grid gap-x-1" style={{ gridTemplateColumns: data.flow.map((f) => `${Math.max(f.total / total, 0.12)}fr`).join(" ") }}>
          {data.flow.map((f, i) => (
            <Link key={f.stage} href={`/applications?stage=${STAGE_ROLE_LINK[f.role] ?? ""}`} className="group block min-w-0">
              <p className="tnum font-display text-[28px] font-light leading-none text-fg transition-colors group-hover:text-accent">{f.total}</p>
              <p className="mt-2 truncate text-[13px] text-fg-3 group-hover:text-fg-2">{f.stage}</p>
              <div className="af-grow mt-4 flex h-3 gap-px" style={{ animationDelay: `${i * 90}ms` }}>
                {([
                  ["late", f.late, "overdue"],
                  ["soon", f.soon, "due within 7 days"],
                  ["wait", f.wait, "waiting for the institution"],
                  ["ok", f.ok, "on track"],
                ] as const).map(([sig, n, label]) =>
                  n > 0 ? (
                    <Tip key={sig} label={`${f.stage}: ${n} ${label}`} className="h-full" style={{ width: `${(n / f.total) * 100}%`, minWidth: 6 }}>
                      <span className={cn("block h-full w-full", signalBg(sig))} />
                    </Tip>
                  ) : null,
                )}
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-5 text-xs text-fg-3" aria-hidden>
          {([["late", "Overdue"], ["soon", "Due this week"], ["wait", "With institution"], ["ok", "On track"]] as const).map(([s, l]) => (
            <span key={s} className="inline-flex items-center gap-2"><span className={cn("size-2", signalBg(s))} />{l}</span>
          ))}
        </div>
      </section>

      <div className="grid gap-x-14 gap-y-12 xl:grid-cols-[1.6fr_1fr]">
        <Card
          title={actor.role === "admin" || actor.role === "regional" || actor.role === "auditor" ? "Needs attention" : "Your desk"}
          actions={<Link href="/applications" className="inline-flex items-center gap-1 text-[13px] text-fg-3 hover:text-accent">All <ArrowUpRight className="size-3.5" /></Link>}
        >
          {data.attention.length === 0 ? (
            <div className="relative h-56 overflow-hidden">
              <Image src={towers} alt="City towers seen through rain on glass" fill sizes="50vw" className="object-cover grayscale" />
              <div className="absolute inset-0 bg-accent/60 mix-blend-multiply" aria-hidden />
              <p className="absolute bottom-5 left-5 font-display text-xl font-light text-ink">Nothing waiting on your desk.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {data.attention.map((a) => {
                const s = deadlineSignal(a.due_at, t, a.status === "decided");
                return (
                  <li key={a.id}>
                    <Link href={`/applications/${a.id}`} className="group grid grid-cols-[3px_1fr_auto] items-center gap-4 py-3.5 transition-colors hover:bg-ink-2">
                      <span className={cn("h-9", signalBg(a.status === "clarification" ? "wait" : s.signal))} aria-hidden />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-fg group-hover:text-accent">{a.title}</span>
                        <span className="block truncate text-xs text-fg-3">{a.institution_name} <span className="font-mono">{a.id}</span></span>
                      </span>
                      <span className="flex items-center gap-4 pr-2">
                        <span className="hidden text-xs text-fg-3 sm:inline">{a.stage_name}</span>
                        <SlaBadge dueAt={a.due_at} nowDate={t} />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-12">
          <Card title="Escalated" actions={<Link href="/alerts" className="text-[13px] text-fg-3 hover:text-accent">Open</Link>}>
            {data.escalations.length === 0 ? (
              <p className="py-4 text-sm text-fg-3">No escalations.</p>
            ) : (
              <ul className="space-y-3">
                {data.escalations.map((e, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Tip label={`Level ${e.level}: sent to ${e.to_role === "regional" ? "regional supervisor" : "administrative authority"}`}>
                      <span className="mt-1 flex gap-px" aria-hidden>
                        {[1, 2].map((l) => <span key={l} className={cn("h-3 w-1", l <= e.level ? "bg-late" : "bg-line-2")} />)}
                      </span>
                    </Tip>
                    <Link href={e.link} className="min-w-0 text-sm text-fg-2 hover:text-accent">
                      <span className="line-clamp-1">{e.entity_label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Activity" description="Recorded actions per day, last 30 days.">
            <div className="flex h-24 items-end gap-[3px]" role="img" aria-label="Activity over the last 30 days">
              {data.activity.map((d, i) => (
                <Tip key={d.day} label={`${new Date(d.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}: ${d.n} action${d.n === 1 ? "" : "s"}`} className="h-full flex-1 items-end">
                  <span
                    className={cn("block w-full", i === data.activity.length - 1 ? "bg-accent" : d.n ? "bg-aqua hover:bg-aqua-2" : "bg-line")}
                    style={{ height: `${Math.max(4, (d.n / maxDay) * 100)}%` }}
                  />
                </Tip>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {data.regions.length > 1 ? (
        <Card title="By region">
          <ul className="grid gap-x-12 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.regions.map((r) => (
              <li key={r.region}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-fg">{r.region}</span>
                  <span className="tnum font-mono text-xs text-fg-3">{r.open}{r.late ? <span className="text-late"> / {r.late}</span> : null}</span>
                </div>
                <Tip label={`${r.region}: ${r.open} open, ${r.late} overdue`} className="mt-2 flex h-1.5 w-full">
                  <span className="flex h-full w-full bg-line">
                    <span className="h-full bg-late" style={{ width: `${(r.late / maxRegion) * 100}%` }} />
                    <span className="h-full bg-aqua" style={{ width: `${((r.open - r.late) / maxRegion) * 100}%` }} />
                  </span>
                </Tip>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

type Data = Awaited<ReturnType<typeof overviewData>>;

function InstitutionHome({ data, t }: { data: Data; t: Date }) {
  const k = data.kpis;
  return (
    <div className="space-y-14">
      <section className="relative -mx-4 h-56 overflow-hidden sm:-mx-8 lg:-mx-12">
        <Image src={campus} alt="Long avenue leading to a historic institution building" fill priority sizes="100vw" className="object-cover object-[50%_40%] grayscale" />
        <div className="absolute inset-0 bg-accent mix-blend-multiply" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-t from-ink to-transparent" aria-hidden />
        <h1 className="absolute bottom-6 left-4 max-w-3xl font-display text-[30px] font-light leading-tight tracking-[-0.02em] text-fg sm:left-8 lg:left-12">
          {k.open} open{k.queue ? <>, <span className="text-amber">{k.queue} need your reply</span></> : null}.
        </h1>
      </section>

      <div className="grid gap-x-14 gap-y-12 xl:grid-cols-2">
        <Card title="Applications" actions={<LinkButton href="/applications/new" size="sm">New application</LinkButton>}>
          <ul className="divide-y divide-line">
            {data.openApps.length === 0 ? <li className="py-4 text-sm text-fg-3">No open applications.</li> : null}
            {data.openApps.map((a) => (
              <li key={a.id}>
                <Link href={`/applications/${a.id}`} className="group flex items-center justify-between gap-4 py-3.5 hover:bg-ink-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-fg group-hover:text-accent">{a.title}</span>
                    <span className="block text-xs text-fg-3">{a.status === "clarification" ? <span className="text-amber">Reply needed</span> : a.stage_name}</span>
                  </span>
                  <SlaBadge dueAt={a.due_at} nowDate={t} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-12">
          <Card title="Undertakings due">
            {data.undertakingsDue.length === 0 ? (
              <p className="py-4 text-sm text-fg-3">Nothing due in the next 30 days.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.undertakingsDue.map((u) => (
                  <li key={u.id}>
                    <Link href={`/undertakings/${u.id}`} className="group flex items-center justify-between gap-4 py-3.5 hover:bg-ink-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-fg group-hover:text-accent">{u.condition}</span>
                        <span className="block text-xs text-fg-3">{UT_STATUS_LABELS[u.status]}</span>
                      </span>
                      <SlaBadge dueAt={u.due_at} nowDate={t} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Documents">
            {data.docsAttention.length === 0 ? (
              <p className="py-4 text-sm text-fg-3">All documents are valid.</p>
            ) : (
              <ul className="space-y-5">
                {data.docsAttention.map((d) => {
                  const v = documentValidity(d);
                  return (
                    <li key={d.id}>
                      <Link href={`/documents/${d.id}`} className="group block">
                        <span className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="truncate text-fg group-hover:text-accent">{d.title}</span>
                          <span className={cn("shrink-0 font-mono text-xs", v.key === "expired" ? "text-late" : "text-amber")}>
                            {v.days === null ? "" : v.days < 0 ? `${Math.abs(v.days)}d ago` : `${v.days}d`}
                          </span>
                        </span>
                        <span className="mt-2 block"><ValidityBar days={v.days} /></span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
