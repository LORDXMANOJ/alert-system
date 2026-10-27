import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { ServiceError } from "@/server/errors";
import { now, addDays, DAY } from "@/server/clock";
import { can, ROLE_LABELS } from "@/server/permissions";
import { getApplicationDetail } from "@/server/services/workflow";
import { EVC_STATUS_LABELS } from "@/server/services/evc";
import { Badge, Card, EmptyState, Field, PageHeader, SlaBadge, StageStepper, TableWrap, inputCls, textareaCls, th, td, cn, LinkButton } from "@/components/ui";
import { ServerForm } from "@/components/server-form";
import {
  assignAction,
  completeStageAction,
  createUndertakingAction,
  decideAction,
  completeEvcAction,
  reportPendingAction,
  respondAction,
  returnAction,
  scheduleEvcAction,
} from "@/app/actions";
import { APP_STATUS_LABELS, DECISION_LABELS, EVENT_LABELS, UT_STATUS_LABELS, fmtDate, fmtDateTime } from "@/lib/labels";

export const dynamic = "force-dynamic";

const TABS = ["summary", "timeline", "evc", "undertakings", "documents", "alerts", "audit"] as const;
type Tab = (typeof TABS)[number];

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "") ? (rawTab as Tab) : "summary";
  const actor = (await getCurrentActor())!;
  const db = await getDb();

  let detail;
  try {
    detail = await getApplicationDetail(db, actor, id);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const { app, stages, events, evc, undertakings, documents, alerts } = detail;
  const t = now();
  const checklist = JSON.parse(app.stage_checklist) as string[];
  const decided = app.status === "decided";
  const inStage = app.status === "in_progress" && app.stage_role === actor.role;
  const canComplete = inStage && can(actor, "app.stage") && !app.is_decision;
  const canReturn = inStage && can(actor, "app.return") && !app.is_decision;
  const canDecide = inStage && can(actor, "app.decide") && app.is_decision;
  const canRespond = actor.role === "institution" && app.status === "clarification" && app.institution_id === actor.institutionId;
  const canAssign = !decided && (actor.role === "admin" || inStage) && actor.role !== "institution" && app.stage_role !== "institution";
  const canManageEvc = !!evc && can(actor, "evc.manage");
  const awaitingEvc = !!evc && ["awaiting_scheduling", "scheduling_in_progress", "scheduled"].includes(String(evc.status));

  const assignees = canAssign
    ? await db.query<{ id: string; name: string }>("SELECT id, name FROM users WHERE role = $1 ORDER BY name", [app.stage_role])
    : null;
  const audit = await db.query<{ id: number; action: string; actor_role: string; actor_id: string; created_at: Date; reason: string | null; meta: string }>(
    "SELECT id, action, actor_role, actor_id, created_at, reason, meta FROM audit_logs WHERE entity_id = $1 ORDER BY id DESC LIMIT 100",
    [app.id],
  );

  const scheduleDefault = new Date(t.getTime() + 7 * DAY + 5.5 * 3600 * 1000).toISOString().slice(0, 16);
  const tabHref = (k: Tab) => `/applications/${app.id}${k === "summary" ? "" : `?tab=${k}`}`;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Applications", href: "/applications" }, { label: app.institution_name }, { label: app.id }]}
        title={app.title}
        actions={
          <>
            <Badge tone={app.status === "clarification" ? "warning" : decided ? "neutral" : "info"}>{APP_STATUS_LABELS[app.status]}</Badge>
            <SlaBadge dueAt={app.due_at} decided={decided} nowDate={t} />
          </>
        }
      />

      <Card bodyClassName="px-5 py-6" className="mb-6">
        <StageStepper
          stages={stages.map((s) => ({ position: s.position, name: s.name, is_evc: s.is_evc, is_decision: s.is_decision }))}
          currentPosition={app.stage_position}
          decided={decided}
          returned={app.status === "clarification"}
        />
        <p className="mt-5 text-sm text-fg-3">
          {decided ? (
            <>Final outcome: <strong className="font-semibold text-fg">{DECISION_LABELS[app.decision ?? ""] ?? app.decision}</strong>. Recorded by the competent authority.</>
          ) : app.status === "clarification" ? (
            <>Returned for clarification: <span className="text-lilac">{app.clarification_reason}</span></>
          ) : (
            null
          )}
        </p>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <nav aria-label="Application sections" className="flex gap-1 overflow-x-auto border-b border-line">
            {TABS.filter((k) => k !== "evc" || evc).map((k) => (
              <Link
                key={k}
                href={tabHref(k)}
                aria-current={tab === k ? "page" : undefined}
                className={cn(
                  "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium capitalize transition-colors",
                  tab === k ? "border-tea text-tea" : "border-transparent text-fg-3 hover:text-fg",
                )}
              >
                {k === "undertakings" ? "Undertakings" : k === "evc" ? "EVC" : k}
              </Link>
            ))}
          </nav>

          {tab === "summary" ? (
            <Card title="Application summary">
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                <Fact label="Application ID" value={<span className="font-mono">{app.id}</span>} />
                <Fact label="Category and workflow" value={`${app.category} · ${app.template_name}`} />
                <Fact label="Submitted" value={fmtDate(app.submitted_at)} />
                <Fact label="Entered current stage" value={fmtDate(app.stage_entered_at)} />
                <Fact label="Stage deadline" value={`${fmtDate(app.due_at)} (target ${app.target_days} days)`} />
                <Fact label="Last action" value={fmtDateTime(app.last_action_at)} />
                <Fact label="Assigned to" value={app.assignee_name ?? "Not yet assigned"} />
                <Fact label="Responsible role" value={ROLE_LABELS[app.stage_role as keyof typeof ROLE_LABELS]} />
              </dl>
              {app.decision_reason ? (
                <div className="mt-6 bg-transparent p-4 text-sm">
                  <p className="font-medium text-fg">Recorded reason</p>
                  <p className="mt-1 text-fg-2">{app.decision_reason}</p>
                </div>
              ) : null}
            </Card>
          ) : null}

          {tab === "timeline" ? (
            <Card title="Processing timeline" description="Every transition, return and decision, newest first. Entries cannot be edited.">
              <ol className="relative space-y-5 border-l-2 border-line pl-6">
                {events.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[31px] top-1 size-3 border-2 border-white bg-tea ring-2" aria-hidden />
                    <p className="text-sm font-medium text-fg">{EVENT_LABELS[e.type] ?? e.type}</p>
                    <p className="text-sm text-fg-3">{e.detail}</p>
                    {e.reason ? <p className="mt-1 bg-ink-3 px-2 py-1 text-xs text-lilac">Reason: {e.reason}</p> : null}
                    <p className="mt-1 text-xs text-fg-3">
                      {e.actor_name ?? "System"} · {ROLE_LABELS[e.actor_role as keyof typeof ROLE_LABELS] ?? e.actor_role} · {fmtDateTime(e.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}

          {tab === "evc" && evc ? (
            <div className="space-y-6">
              <Card title="EVC record" description="Visit scheduling and completion. The stage can only be completed after the visit is recorded.">
                <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                  <Fact label="Status" value={<Badge tone={evc.status === "completed" || evc.status === "closed" ? "success" : "info"}>{EVC_STATUS_LABELS[String(evc.status)]}</Badge>} />
                  <Fact label="Target date" value={fmtDate(evc.target_date as Date)} />
                  <Fact label="Scheduled visit" value={evc.scheduled_date ? fmtDateTime(evc.scheduled_date as Date) : "Not yet scheduled"} />
                  <Fact label="Visit completed" value={evc.completed_date ? fmtDate(evc.completed_date as Date) : "—"} />
                  <Fact label="Notes" value={String(evc.notes || "—")} className="sm:col-span-2" />
                </dl>
                {awaitingEvc ? <div className="mt-4"><SlaBadge dueAt={(evc.scheduled_date as Date | null) ?? (evc.target_date as Date)} nowDate={t} /></div> : null}
              </Card>
              {canManageEvc && (evc.status === "awaiting_scheduling" || evc.status === "scheduling_in_progress" || evc.status === "scheduled") ? (
                <Card title="Schedule the visit" description="Record the visit date. The institution is notified automatically.">
                  <ServerForm action={scheduleEvcAction} submit="Save schedule" ariaLabel="Schedule EVC visit">
                    <input type="hidden" name="applicationId" value={app.id} />
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="Visit date and time" htmlFor="scheduledFor">
                        <input id="scheduledFor" name="scheduledFor" type="datetime-local" required defaultValue={scheduleDefault} className={inputCls} />
                      </Field>
                      <Field label="Coordination notes" htmlFor="notes" hint="Optional.">
                        <input id="notes" name="notes" maxLength={500} className={inputCls} placeholder="For example: committee members confirmed" />
                      </Field>
                    </div>
                  </ServerForm>
                </Card>
              ) : null}
              {canManageEvc && (evc.status === "scheduled" || evc.status === "scheduling_in_progress") ? (
                <Card title="Record the visit" description="Confirm that the visit took place and record the key observations (at least 10 characters).">
                  <ServerForm action={completeEvcAction} submit="Mark visit completed" ariaLabel="Record EVC visit">
                    <input type="hidden" name="applicationId" value={app.id} />
                    <Field label="Visit observations" htmlFor="visit-notes">
                      <textarea id="visit-notes" name="notes" required minLength={10} className={textareaCls} />
                    </Field>
                  </ServerForm>
                </Card>
              ) : null}
              {canManageEvc && evc.status === "completed" ? (
                <Card title="Post-visit action">
                  <ServerForm action={reportPendingAction} submit="Mark report pending" variant="secondary" resetOnSuccess={false}>
                    <input type="hidden" name="applicationId" value={app.id} />
                    <p className="text-sm text-fg-3">If the visit report is still outstanding, mark it as report pending.</p>
                  </ServerForm>
                </Card>
              ) : null}
            </div>
          ) : null}

          {tab === "undertakings" ? (
            <div className="space-y-6">
              <Card title="Undertakings linked to this application" description="Time-bound conditions and their evidence status.">
                {undertakings.length === 0 ? (
                  <EmptyState title="No undertakings recorded" description="Undertakings are recorded when an approval carries a time-bound condition." />
                ) : (
                  <ul className="divide-y divide-line">
                    {undertakings.map((u) => (
                      <li key={String(u.id)} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <Link href={`/undertakings/${u.id}`} className="font-medium text-fg hover:text-tea hover:underline">{String(u.condition)}</Link>
                          <p className="font-mono text-xs text-fg-3">{String(u.id)} · {UT_STATUS_LABELS[String(u.status)]}</p>
                        </div>
                        <SlaBadge dueAt={u.due_at as Date} decided={u.status === "verified"} nowDate={t} />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              {can(actor, "ut.create") ? (
                <Card title="Record a new undertaking" description="The due date is calculated from the number of days you enter.">
                  <ServerForm action={createUndertakingAction} submit="Record undertaking" ariaLabel="Record undertaking">
                    <input type="hidden" name="applicationId" value={app.id} />
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field label="Condition" htmlFor="ut-condition" className="sm:col-span-2">
                        <textarea id="ut-condition" name="condition" required minLength={10} className={textareaCls} placeholder="Describe the condition the institution must fulfil." />
                      </Field>
                      <Field label="Evidence required" htmlFor="ut-evidence">
                        <input id="ut-evidence" name="evidenceRequired" required minLength={5} className={inputCls} placeholder="For example: renewed lease deed (PDF)" />
                      </Field>
                      <Field label="Due in (days)" htmlFor="ut-days" hint="Configure to the applicable rule.">
                        <input id="ut-days" name="dueInDays" type="number" required min={1} max={730} defaultValue={60} className={inputCls} />
                      </Field>
                    </div>
                  </ServerForm>
                </Card>
              ) : null}
            </div>
          ) : null}

          {tab === "documents" ? (
            <Card title="Documents linked to this application" description="Prescribed documents and their verification status.">
              {documents.length === 0 ? (
                <EmptyState title="No linked documents" description="Lease and other prescribed documents are tracked in the document register." action={<LinkButton href="/documents" variant="secondary">Open document register</LinkButton>} />
              ) : (
                <ul className="divide-y divide-line">
                  {documents.map((d) => (
                    <li key={String(d.id)} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <Link href={`/documents/${d.id}`} className="font-medium text-fg hover:text-tea hover:underline">{String(d.title)}</Link>
                        <p className="text-xs text-fg-3">{String(d.category)} · {Number(d.version_count)} version(s)</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {tab === "alerts" ? (
            <Card title="Alerts for this application" description="Alerts raised by the deadline engine. Acknowledge and resolve them in the alert centre.">
              {alerts.length === 0 ? (
                <EmptyState title="No alerts for this application" />
              ) : (
                <ul className="divide-y divide-line">
                  {alerts.map((al) => (
                    <li key={String(al.id)} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                      <div>
                        <p className="font-medium text-fg">{String(al.rule_name)}</p>
                        <p className="text-fg-3">{String(al.message)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={al.threshold_key === "overdue" ? "danger" : "warning"}>{al.threshold_key === "overdue" ? "Overdue" : String(al.threshold_key)}</Badge>
                        <Badge tone={al.status === "resolved" ? "success" : "neutral"}>{String(al.status)}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          {tab === "audit" ? (
            <Card title="Audit entries" description="Recorded actions for this application. Read-only.">
              <TableWrap>
                <table className="w-full min-w-[560px]">
                  <thead className="border-b border-line bg-transparent">
                    <tr>
                      <th className={th}>When</th>
                      <th className={th}>Action</th>
                      <th className={th}>Role</th>
                      <th className={th}>Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {audit.rows.map((a) => (
                      <tr key={a.id}>
                        <td className={td}>{fmtDateTime(a.created_at)}</td>
                        <td className={cn(td, "font-mono text-xs")}>{a.action}</td>
                        <td className={td}>{a.actor_role}</td>
                        <td className={td}>{a.reason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-6" aria-label="Available actions">
          <Card title="Your next action" description={actionIntro(actor.role, { inStage, decided, canRespond, app })}>
            {canComplete ? (
              <ServerForm
                action={completeStageAction}
                submit="Complete stage"
                confirm={{ title: "Complete this stage?", body: "The application will move to the next configured stage. The step is recorded in the timeline and audit trail." }}
                ariaLabel="Complete stage"
              >
                <input type="hidden" name="applicationId" value={app.id} />
                <input type="hidden" name="count" value={checklist.length} />
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-medium text-fg">Confirm the checklist</legend>
                  {checklist.map((item, i) => (
                    <label key={item} className="flex items-start gap-2.5 text-sm text-fg-2">
                      <input type="checkbox" name={`c${i}`} className="mt-0.5 size-4 accent-[#c1f7dc]" />
                      <span>{item}</span>
                    </label>
                  ))}
                  {checklist.length === 0 ? <p className="text-sm text-fg-3">This stage has no checklist. Its completion condition is the visit record, if one is required.</p> : null}
                </fieldset>
                <div className="mt-4">
                  <Field label="Observations" htmlFor="observations" hint="Optional. Visible in the timeline.">
                    <textarea id="observations" name="observations" className={textareaCls} maxLength={1000} />
                  </Field>
                </div>
              </ServerForm>
            ) : null}

            {inStage && app.is_evc && !canComplete ? <p className="text-sm text-fg-3">Complete the EVC visit in the EVC tab first.</p> : null}

            {canDecide ? (
              <ServerForm
                action={decideAction}
                submit="Record decision"
                variant="primary"
                confirm={{ title: "Record the final decision?", body: "This records the outcome as the competent authority. The system does not make this decision and the record is permanent." }}
                ariaLabel="Record decision"
                className="mt-6 border-t border-line pt-5"
              >
                <input type="hidden" name="applicationId" value={app.id} />
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-medium text-fg">Outcome</legend>
                  {(["approved", "deferred", "rejected"] as const).map((o) => (
                    <label key={o} className="flex items-center gap-2.5 text-sm text-fg-2">
                      <input type="radio" name="outcome" value={o} required className="size-4 accent-[#c1f7dc]" /> {DECISION_LABELS[o]}
                    </label>
                  ))}
                </fieldset>
                <div className="mt-4">
                  <Field label="Reason" htmlFor="decision-reason" hint="At least 10 characters. Recorded permanently.">
                    <textarea id="decision-reason" name="reason" required minLength={10} className={textareaCls} />
                  </Field>
                </div>
                <label className="mt-4 flex items-start gap-2.5 text-sm text-fg-2">
                  <input type="checkbox" name="confirmed" required className="mt-0.5 size-4 accent-[#c1f7dc]" />
                  I have reviewed the history, observations and evidence.
                </label>
              </ServerForm>
            ) : null}

            {canReturn ? (
              <ServerForm
                action={returnAction}
                submit="Return for clarification"
                variant="secondary"
                confirm={{ title: "Return this application?", body: "The institution will be asked for clarification. Give a clear reason, because it is kept in the history." }}
                ariaLabel="Return for clarification"
                className="mt-6 border-t border-line pt-5"
              >
                <input type="hidden" name="applicationId" value={app.id} />
                <Field label="Reason for return" htmlFor="return-reason" hint="At least 10 characters.">
                  <textarea id="return-reason" name="reason" required minLength={10} className={textareaCls} />
                </Field>
              </ServerForm>
            ) : null}

            {canRespond ? (
              <ServerForm action={respondAction} submit="Send response" ariaLabel="Respond to clarification">
                <input type="hidden" name="applicationId" value={app.id} />
                <Field label="Your response" htmlFor="response" hint="Describe what you have supplied or corrected (at least 10 characters).">
                  <textarea id="response" name="response" required minLength={10} className={textareaCls} />
                </Field>
              </ServerForm>
            ) : null}

            {!canComplete && !canDecide && !canReturn && !canRespond ? (
              <p className="text-sm text-fg-3">
                {decided ? "This application has a recorded decision. Nothing further is required." : app.status === "clarification" && actor.role !== "institution" ? "Waiting for the institution to respond to the clarification request." : "No action is required from you on this application right now."}
              </p>
            ) : null}
          </Card>

          {canAssign && assignees ? (
            <Card title="Assignee" description="Choose the officer responsible for this stage.">
              <ServerForm action={assignAction} submit="Save assignee" variant="secondary" resetOnSuccess={false} ariaLabel="Assign officer">
                <input type="hidden" name="applicationId" value={app.id} />
                <Field label="Officer" htmlFor="userId">
                  <select id="userId" name="userId" required defaultValue={app.assignee_id ?? ""} className={inputCls}>
                    <option value="" disabled>Choose an officer</option>
                    {assignees.rows.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </Field>
              </ServerForm>
            </Card>
          ) : null}

          <Card title="Stage deadline" description="Configurable by an administrator.">
            <p className="text-sm text-fg-2">
              Target: <span className="tnum font-semibold">{app.target_days}</span> days for {app.stage_name}. Due{" "}
              <span className="font-medium">{fmtDate(addDays(app.stage_entered_at, app.target_days))}</span>.
            </p>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Fact({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-fg-3">{label}</dt>
      <dd className="mt-1 text-sm text-fg">{value}</dd>
    </div>
  );
}

function actionIntro(role: string, s: { inStage: boolean; decided: boolean; canRespond: boolean; app: { status: string; stage_name: string } }) {
  if (s.decided) return "Decided and closed.";
  if (s.canRespond) return "The office has asked for clarification. Respond to continue.";
  if (s.inStage) return `This is your stage: ${s.app.stage_name}.`;
  if (role === "institution") return "Track the progress of this application here.";
  return "This application is at another stage.";
}
