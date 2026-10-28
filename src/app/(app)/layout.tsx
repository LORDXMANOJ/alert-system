import { redirect } from "next/navigation";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { ROLE_LABELS } from "@/server/permissions";
import { navCounts } from "@/server/services/overview";
import { navFor } from "@/lib/nav";
import { AppShell } from "@/components/app-shell";
import { logoutAction } from "@/app/actions";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  const db = await getDb();
  const counts = await navCounts(db, actor);
  const jar = await cookies();

  return (
    <AppShell
      nav={navFor(actor.role)}
      counts={counts}
      actor={{ name: actor.name, designation: actor.designation, roleLabel: ROLE_LABELS[actor.role], role: actor.role }}
      initialCollapsed={jar.get("af-sidebar")?.value === "collapsed"}
      logout={logoutAction}
    >
      {children}
    </AppShell>
  );
}
