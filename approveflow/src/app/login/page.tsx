import { getDb } from "@/server/db";
import { ROLE_LABELS, type Role } from "@/server/permissions";
import { loginAction } from "@/app/actions";
import { buttonClass } from "@/components/ui";
import { Building2, Gauge, ShieldCheck, Info } from "lucide-react";

export const dynamic = "force-dynamic";

const ORDER: Role[] = ["admin", "regional", "bureau", "evc", "reviewer", "authority", "auditor", "institution"];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const db = await getDb();
  const users = await db.query<{ id: string; name: string; designation: string; role: Role; institution_name: string | null; region_name: string | null }>(
    `SELECT u.id, u.name, u.designation, u.role, i.name AS institution_name, r.name AS region_name
     FROM users u LEFT JOIN institutions i ON i.id = u.institution_id LEFT JOIN regions r ON r.id = u.region_id
     ORDER BY u.id`,
  );
  const sorted = [...users.rows].sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role));

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-5 sm:px-6">
          <span className="flex size-10 items-center justify-center rounded-lg bg-cobalt">
            <Gauge className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-base font-semibold">ApproveFlow AICTE</p>
            <p className="text-xs text-slate-300">Approval &amp; Compliance Command Centre · SIH26262 prototype</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight text-navy">Choose a demonstration account</h1>
          <p className="mt-2 text-slate-600">
            Each card signs you in as a fictional person with one role. Switch roles at any time with the sign-out button, to see
            the same record from another desk.
          </p>
        </div>

        <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-soft p-4 text-sm text-amber-text">
          <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>
            <strong className="font-semibold">Demo authentication.</strong> These accounts are fictional and exist only for this
            prototype. Production use would need real identity verification and a managed sign-in service.
          </p>
        </div>

        {error === "unknown" ? (
          <p role="alert" className="mt-4 rounded-md bg-crimson-soft px-4 py-3 text-sm text-crimson">That demonstration account was not found.</p>
        ) : null}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((u) => (
            <form key={u.id} action={loginAction} className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-shadow hover:shadow-md">
              <input type="hidden" name="userId" value={u.id} />
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-cobalt-soft px-2.5 py-0.5 text-xs font-medium text-cobalt ring-1 ring-inset ring-blue-200">
                  {ROLE_LABELS[u.role]}
                </span>
              </div>
              <p className="mt-3 text-base font-semibold text-navy">{u.name}</p>
              <p className="text-sm text-slate-600">{u.designation}</p>
              {u.institution_name || u.region_name ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <Building2 className="size-3.5" aria-hidden />
                  {u.institution_name ?? `${u.region_name} region`}
                </p>
              ) : null}
              <button type="submit" className={buttonClass("primary", "md", "mt-5 w-full")}>
                Sign in as {ROLE_LABELS[u.role]}
              </button>
            </form>
          ))}
        </div>

        <p className="mt-8 flex items-start gap-2 text-xs text-slate-500">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          All institutions, people, applications and documents are fictional demonstration data.
        </p>
      </main>
    </div>
  );
}
