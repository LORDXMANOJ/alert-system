import { redirect } from "next/navigation";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { can } from "@/server/permissions";
import { Card, Field, PageHeader, inputCls, selectCls } from "@/components/ui";
import { ServerForm } from "@/components/server-form";
import { createApplicationAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function NewApplicationPage() {
  const actor = (await getCurrentActor())!;
  if (!can(actor, "app.create")) redirect("/applications");
  const db = await getDb();
  const [templates, institutions, stages] = await Promise.all([
    db.query<{ id: string; name: string; category: string; description: string }>(
      "SELECT id, name, category, description FROM workflow_templates WHERE active ORDER BY category",
    ),
    db.query<{ id: string; name: string; city: string; region: string }>(
      `SELECT i.id, i.name, i.city, r.name AS region FROM institutions i JOIN regions r ON r.id = i.region_id ORDER BY i.name`,
    ),
    db.query<{ template_id: string; position: number; name: string; role: string; target_days: number; is_evc: boolean; is_decision: boolean }>(
      "SELECT template_id, position, name, role, target_days, is_evc, is_decision FROM workflow_stages ORDER BY template_id, position",
    ),
  ]);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Applications", href: "/applications" }, { label: "New application" }]}
        title="New application"
        description="The category decides which configured workflow the application follows. Stage durations are illustrative and can be changed by an administrator."
      />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Application details" className="xl:col-span-2">
          <ServerForm action={createApplicationAction} submit="Submit application" ariaLabel="New application form">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Application title" htmlFor="title" className="sm:col-span-2">
                <input id="title" name="title" required minLength={5} maxLength={140} className={inputCls} placeholder="For example: Additional laboratory block" />
              </Field>
              <Field label="Category" htmlFor="category" hint="Chooses the workflow template.">
                <select id="category" name="category" required className={selectCls}>
                  {templates.rows.map((t) => (
                    <option key={t.id} value={t.category}>{t.category}</option>
                  ))}
                </select>
              </Field>
              {actor.role !== "institution" ? (
                <Field label="Institution" htmlFor="institutionId">
                  <select id="institutionId" name="institutionId" required className={selectCls}>
                    {institutions.rows.map((i) => (
                      <option key={i.id} value={i.id}>{i.name} · {i.region}</option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label="Institution" htmlFor="institution-readonly" hint="Applications are filed for your own institution.">
                  <input id="institution-readonly" disabled value="Your institution" className={inputCls} />
                </Field>
              )}
            </div>
          </ServerForm>
        </Card>

        <Card title="Workflow preview" description="The stages each category passes through, in order.">
          <ul className="space-y-4">
            {templates.rows.map((t) => {
              const list = stages.rows.filter((s) => s.template_id === t.id);
              return (
                <li key={t.id}>
                  <p className="text-sm font-medium text-navy">{t.category}</p>
                  <p className="text-xs text-slate-500">{t.name}</p>
                  <ol className="mt-1.5 space-y-1 text-xs text-slate-600">
                    {list.map((s) => (
                      <li key={s.position} className="flex justify-between gap-2">
                        <span>{s.position}. {s.name}{s.is_evc ? " (EVC)" : ""}</span>
                        <span className="tnum text-slate-400">{s.target_days} d</span>
                      </li>
                    ))}
                  </ol>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
