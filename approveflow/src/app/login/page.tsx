import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { getDb } from "@/server/db";
import { ROLE_LABELS, type Role } from "@/server/permissions";
import { loginAction } from "@/app/actions";
import { LogoMark } from "@/components/logo";
import corridor from "../../../public/images/corridor.jpg";

export const dynamic = "force-dynamic";

const ORDER: Role[] = ["admin", "regional", "bureau", "evc", "reviewer", "authority", "auditor", "institution"];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const db = await getDb();
  const users = await db.query<{ id: string; name: string; role: Role; institution_name: string | null; region_name: string | null }>(
    `SELECT u.id, u.name, u.role, i.name AS institution_name, r.name AS region_name
     FROM users u LEFT JOIN institutions i ON i.id = u.institution_id LEFT JOIN regions r ON r.id = u.region_id
     ORDER BY u.id`,
  );
  const sorted = [...users.rows].sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role));

  return (
    <main className="grid min-h-[100dvh] bg-ink lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden lg:block">
        <Image src={corridor} alt="Rows of lecture-hall seats in warm light" fill priority sizes="55vw" className="object-cover grayscale" />
        <div className="absolute inset-0 bg-accent mix-blend-multiply" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" aria-hidden />
        <div className="absolute inset-x-12 bottom-12">
          <p className="max-w-md font-display text-[34px] font-light leading-[1.15] tracking-[-0.02em] text-fg">
            Every approval, every deadline, in one flow.
          </p>
        </div>
      </section>

      <section className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 text-accent">
            <LogoMark size={28} />
            <span className="font-display text-lg text-fg">ApproveFlow</span>
          </div>
          <h1 className="mt-14 font-display text-[28px] font-light tracking-[-0.02em] text-fg">Sign in</h1>
          <p className="mt-2 text-sm text-fg-3">Choose your desk.</p>

          {error === "unknown" ? <p role="alert" className="mt-6 text-sm text-late">That account was not found.</p> : null}

          <ul className="mt-8 border-t border-line">
            {sorted.map((u) => (
              <li key={u.id} className="border-b border-line">
                <form action={loginAction}>
                  <input type="hidden" name="userId" value={u.id} />
                  <button
                    type="submit"
                    aria-label={`Sign in as ${ROLE_LABELS[u.role]}, ${u.name}`}
                    className="group flex w-full items-center gap-4 py-3.5 text-left transition-colors hover:bg-ink-2 focus-visible:bg-ink-2"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center bg-ink-3 font-display text-[11px] text-fg-2 transition-colors group-hover:bg-accent group-hover:text-ink">
                      {u.name.replace(/^(Dr|Prof)\.\s*/, "").split(" ").map((p) => p[0]).slice(0, 2).join("")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg">{u.name}</span>
                      <span className="block truncate text-xs text-fg-3">
                        {ROLE_LABELS[u.role]}
                        {u.institution_name ? `, ${u.institution_name}` : u.region_name ? `, ${u.region_name}` : ""}
                      </span>
                    </span>
                    <ArrowRight className="size-4 -translate-x-2 text-accent opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
