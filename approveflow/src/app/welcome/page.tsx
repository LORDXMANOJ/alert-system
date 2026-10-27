import { redirect } from "next/navigation";
import { getCurrentActor } from "@/server/auth";
import { ROLE_LABELS } from "@/server/permissions";
import { WelcomeMoment } from "@/components/welcome-moment";

export const dynamic = "force-dynamic";

function greeting(): string {
  const hour = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function WelcomePage() {
  const actor = await getCurrentActor();
  if (!actor) redirect("/login");
  const first = actor.name.replace(/^(Dr|Prof)\.\s*/, "").split(" ")[0];
  return <WelcomeMoment greeting={`${greeting()}, ${first}`} role={ROLE_LABELS[actor.role]} />;
}
