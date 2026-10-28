import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { ServiceError } from "@/server/errors";
import { now } from "@/server/clock";
import { can } from "@/server/permissions";
import { loadUndertaking } from "@/server/services/compliance";
import { Badge, Card, Field, PageHeader, SlaBadge, inputCls, textareaCls, cn } from "@/components/ui";
import { ServerForm } from "@/components/server-form";
import { reviewUndertakingAction, submitEvidenceAction } from "@/app/actions";
import { UT_STATUS_LABELS, fmtDate, fmtDateTime } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function UndertakingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = (await getCurrentActor())!;
  const db = await getDb();
  let data;
  try {
    data = await loadUndertaking(db, actor, id);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const { ut, submissions } = data;
  const t = now();
  const canSubmit = actor.role === "institution" && actor.institutionId === ut.institution_id && (ut.status === "active" || ut.status === "correction_requested");
  const canReview = can(actor, "ut.review") && ut.status === "submitted";

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Undertakings", href: "/undertakings" }, { label: ut.id }]}
        title={ut.condition}
        description={`${ut.institution_name} · linked to ${ut.application_id}`}
        actions={
          <>
            <Badge tone={ut.status === "verified" ? "success" : ut.status === "correction_requested" ? "danger" : ut.status === "submitted" ? "info" : "neutral"}>
              {UT_STATUS_LABELS[ut.status]}
            </Badge>
            <SlaBadge dueAt={ut.due_at} decided={ut.status === "verified"} nowDate={t} />
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Submission history" description="Each evidence version is kept. Earlier versions are never overwritten.">
            {submissions.length === 0 ? (
              <p className="text-sm text-fg-3">No evidence has been submitted yet.</p>
            ) : (
              <ol className="space-y-4">
                {submissions.map((s) => (
                  <li key={String(s.id)} className="border border-line p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-fg">Version {String(s.version_no)} · {String(s.submitted_by_name)}</p>
                      <Badge tone={s.review_status === "accepted" ? "success" : s.review_status === "correction_requested" ? "danger" : "info"}>
                        {s.review_status === "accepted" ? "Verified" : s.review_status === "correction_requested" ? "Corrections requested" : "Awaiting review"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-fg-2">{String(s.note)}</p>
                    <p className="mt-2 text-xs text-fg-3">
                      File: <a href={`/api/files/${s.file_id}`} className="font-medium text-accent hover:underline">{String(s.file_name)}</a> · submitted {fmtDateTime(s.submitted_at as Date)}
                    </p>
                    {s.remarks ? (
                      <p className={cn("mt-3  px-3 py-2 text-sm", s.review_status === "accepted" ? "bg-accent/10 text-accent" : "bg-ink-3 text-amber")}>
                        Reviewer ({String(s.reviewer_name ?? "—")}): {String(s.remarks)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {canReview ? (
            <Card title="Record the verification outcome" description="Accepting verifies the undertaking. Requesting corrections returns it to the institution with your remarks.">
              <ServerForm action={reviewUndertakingAction} submit="Record outcome" ariaLabel="Review evidence">
                <input type="hidden" name="undertakingId" value={ut.id} />
                <fieldset className="mb-4 flex flex-col gap-2 sm:flex-row sm:gap-6">
                  <legend className="sr-only">Outcome</legend>
                  <label className="flex items-center gap-2 text-sm text-fg"><input type="radio" name="outcome" value="accepted" required className="size-4 accent-[#824670]" /> Accept evidence and verify</label>
                  <label className="flex items-center gap-2 text-sm text-fg"><input type="radio" name="outcome" value="correction_requested" className="size-4 accent-[#824670]" /> Request corrections</label>
                </fieldset>
                <Field label="Remarks" htmlFor="remarks" hint="Required when requesting corrections (at least 10 characters).">
                  <textarea id="remarks" name="remarks" className={textareaCls} />
                </Field>
              </ServerForm>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Card title="Obligation">
            <dl className="space-y-4 text-sm">
              <div><dt className="text-xs font-medium uppercase tracking-wide text-fg-3">Condition</dt><dd className="mt-1 text-fg">{ut.condition}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-fg-3">Evidence required</dt><dd className="mt-1 text-fg">{ut.evidence_required}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-fg-3">Issued</dt><dd className="mt-1 text-fg">{fmtDate(ut.issued_at)}</dd></div>
              <div><dt className="text-xs font-medium uppercase tracking-wide text-fg-3">Due</dt><dd className="mt-1 text-fg">{fmtDate(ut.due_at)}</dd></div>
              {ut.verified_at ? <div><dt className="text-xs font-medium uppercase tracking-wide text-fg-3">Verified</dt><dd className="mt-1 text-fg">{fmtDate(ut.verified_at)}</dd></div> : null}
            </dl>
            
          </Card>

          {canSubmit ? (
            <Card title="Submit evidence" description="PDF, PNG or JPG up to 10 MB. Submitting does not verify the undertaking; a reviewer does that.">
              <ServerForm action={submitEvidenceAction} submit="Submit evidence" ariaLabel="Submit evidence">
                <input type="hidden" name="undertakingId" value={ut.id} />
                <Field label="Evidence file" htmlFor="file">
                  <input id="file" name="file" type="file" required accept="application/pdf,image/png,image/jpeg" className={cn(inputCls, "h-auto py-2 file:mr-3 file: file:border-0 file:bg-ink-3 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent")} />
                </Field>
                <div className="mt-4">
                  <Field label="Note for the reviewer" htmlFor="note">
                    <textarea id="note" name="note" required minLength={5} className={textareaCls} placeholder={`Describe the evidence (required: ${ut.evidence_required})`} />
                  </Field>
                </div>
              </ServerForm>
            </Card>
          ) : null}

          <Link href="/undertakings" className="block text-sm font-medium text-accent hover:underline">Back to undertakings</Link>
        </aside>
      </div>
    </>
  );
}
