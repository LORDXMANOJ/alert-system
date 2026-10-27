import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { ServiceError } from "@/server/errors";
import { can } from "@/server/permissions";
import { documentValidity, loadDocument } from "@/server/services/compliance";
import { Badge, Card, Field, PageHeader, ValidityBar, inputCls, textareaCls, cn } from "@/components/ui";
import { ServerForm } from "@/components/server-form";
import { renewalAction, reviewDocumentAction } from "@/app/actions";
import { VALIDITY_TONE, fmtDate, fmtDateTime } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = (await getCurrentActor())!;
  const db = await getDb();
  let data;
  try {
    data = await loadDocument(db, actor, id);
  } catch (err) {
    if (err instanceof ServiceError && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const { doc, versions } = data;
  const validity = documentValidity(doc);
  const pending = versions.find((v) => v.review_status === "pending");
  const canRenew = can(actor, "doc.upload") && actor.institutionId === doc.institution_id && !pending;
  const canReview = can(actor, "doc.review") && !!pending;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Documents", href: "/documents" }, { label: doc.id }]}
        title={doc.title}
        description={`${doc.institution_name} · ${doc.category}`}
        actions={<Badge tone={VALIDITY_TONE[validity.key] ?? "neutral"}>{validity.label}</Badge>}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Version history" description="Every version is kept. Only an accepted version counts as verified.">
            <ol className="space-y-4">
              {versions.map((v) => (
                <li key={String(v.version_no)} className={cn(" border p-4", v.review_status === "accepted" && v.version_no === doc.current_version_no ? "border-tea/40 bg-tea/5" : "border-line")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-fg">
                      Version {String(v.version_no)}
                      {v.version_no === doc.current_version_no ? <span className="ml-2 text-xs font-medium text-tea">Current verified copy</span> : null}
                    </p>
                    <Badge tone={v.review_status === "accepted" ? (v.version_no === doc.current_version_no ? "success" : "neutral") : v.review_status === "returned" ? "danger" : "info"}>
                      {v.review_status === "accepted" ? (v.version_no === doc.current_version_no ? "Accepted" : "Superseded") : v.review_status === "returned" ? "Returned" : "Awaiting review"}
                    </Badge>
                  </div>
                  <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <div><dt className="text-xs text-fg-3">Expires</dt><dd className="text-fg">{fmtDate(v.expires_at as Date)}</dd></div>
                    <div><dt className="text-xs text-fg-3">Uploaded</dt><dd className="text-fg">{fmtDateTime(v.submitted_at as Date)} by {String(v.uploaded_by_name)}</dd></div>
                    {v.replaces_version_no ? <div><dt className="text-xs text-fg-3">Replaces</dt><dd className="text-fg">Version {String(v.replaces_version_no)}</dd></div> : null}
                    <div><dt className="text-xs text-fg-3">File</dt><dd><a href={`/api/files/${v.file_id}`} className="font-medium text-tea hover:underline">{String(v.file_name)}</a></dd></div>
                    {v.reviewer_name ? <div className="sm:col-span-2"><dt className="text-xs text-fg-3">Reviewed by</dt><dd className="text-fg">{String(v.reviewer_name)} · {fmtDateTime(v.reviewed_at as Date)}</dd></div> : null}
                  </dl>
                  {v.remarks ? <p className="mt-3 bg-transparent px-3 py-2 text-sm text-fg-2">{String(v.remarks)}</p> : null}
                </li>
              ))}
            </ol>
          </Card>

          {canReview && pending ? (
            <Card title={`Review version ${pending.version_no}`} description="Accept it to make it the verified copy, or return it with corrections. The earlier version stays in the history either way.">
              <ServerForm action={reviewDocumentAction} submit="Record review" ariaLabel="Review document version">
                <input type="hidden" name="documentId" value={doc.id} />
                <input type="hidden" name="versionNo" value={String(pending.version_no)} />
                <fieldset className="mb-4 flex flex-col gap-2 sm:flex-row sm:gap-6">
                  <legend className="sr-only">Outcome</legend>
                  <label className="flex items-center gap-2 text-sm text-fg"><input type="radio" name="outcome" value="accepted" required className="size-4 accent-[#c1f7dc]" /> Accept as verified</label>
                  <label className="flex items-center gap-2 text-sm text-fg"><input type="radio" name="outcome" value="returned" className="size-4 accent-[#c1f7dc]" /> Return for corrections</label>
                </fieldset>
                <Field label="Remarks" htmlFor="doc-remarks" hint="Required when returning (at least 10 characters).">
                  <textarea id="doc-remarks" name="remarks" className={textareaCls} />
                </Field>
              </ServerForm>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Card title="Validity">
            <p className="text-sm text-fg">{validity.label}</p>
            <p className="mt-1 text-sm text-fg-3">
              {validity.days === null ? "No accepted version yet." : validity.days < 0 ? `Expired ${Math.abs(validity.days)} day(s) ago.` : `${validity.days} day(s) remaining.`}
            </p>
            <div className="mt-4"><ValidityBar days={validity.days} /></div>
            <p className="mt-4 text-xs text-fg-3">Reminders: 30, 15, 7 and 0 days before expiry, then an overdue alert.</p>
          </Card>

          {canRenew ? (
            <Card title="Upload a renewal" description="The renewal waits for review. It does not replace the verified copy until accepted.">
              <ServerForm action={renewalAction} submit="Submit renewal" ariaLabel="Upload renewal">
                <input type="hidden" name="documentId" value={doc.id} />
                <div className="space-y-4">
                  <Field label="New expiry date" htmlFor="renew-expiry">
                    <input id="renew-expiry" name="expiresOn" type="date" required className={inputCls} />
                  </Field>
                  <Field label="Renewed document" htmlFor="renew-file">
                    <input id="renew-file" name="file" type="file" required accept="application/pdf,image/png,image/jpeg" className={cn(inputCls, "h-auto py-2 file:mr-3 file: file:border-0 file:bg-ink-3 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-tea")} />
                  </Field>
                </div>
              </ServerForm>
            </Card>
          ) : pending ? (
            <Card title="Renewal under review">
              <p className="text-sm text-fg-3">Version {String(pending.version_no)} is waiting for a reviewer. A new renewal can be uploaded after this review.</p>
            </Card>
          ) : null}

          <Link href="/documents" className="block text-sm font-medium text-tea hover:underline">Back to the register</Link>
        </aside>
      </div>
    </>
  );
}
