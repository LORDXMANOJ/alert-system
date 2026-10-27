import Link from "next/link";
import { Bell } from "lucide-react";
import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { listNotifications } from "@/server/services/notifications";
import { Badge, Card, EmptyState, PageHeader, cn } from "@/components/ui";
import { ActionButton } from "@/components/server-form";
import { markAllReadAction, markReadAction } from "@/app/actions";
import { fmtDateTime, SEVERITY_TONE } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const sp = await searchParams;
  const actor = (await getCurrentActor())!;
  const db = await getDb();
  const filter = sp.filter === "unread" ? "unread" : "all";
  const rows = await listNotifications(db, actor, filter);
  const unread = rows.filter((r) => !r.read_at).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Assignments, clarification requests, deadlines, EVC updates and escalations addressed to you. Each one links to the record it concerns."
        actions={unread > 0 ? <ActionButton action={markAllReadAction} label="Mark all as read" variant="secondary" size="md" /> : null}
      />
      <Card
        bodyClassName="px-0 py-0"
        actions={
          <nav aria-label="Filter notifications" className="flex gap-1.5">
            {[
              { key: "all", label: "All" },
              { key: "unread", label: "Unread" },
            ].map((f) => (
              <Link
                key={f.key}
                href={`/notifications?filter=${f.key}`}
                aria-current={filter === f.key ? "page" : undefined}
                className={cn("rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset", filter === f.key ? "bg-navy text-white ring-navy" : "bg-white text-slate-600 ring-slate-300 hover:text-navy")}
              >
                {f.label}
              </Link>
            ))}
          </nav>
        }
      >
        {rows.length === 0 ? (
          <EmptyState icon={<Bell className="size-5" aria-hidden />} title={filter === "unread" ? "No unread notifications" : "No notifications yet"} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((n) => (
              <li key={n.id} className={cn("flex flex-wrap items-start gap-4 px-5 py-4", !n.read_at && "bg-cobalt-soft/50")}>
                <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-cobalt")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={n.link} className="text-sm font-semibold text-navy hover:text-cobalt hover:underline">{n.title}</Link>
                    <Badge tone={SEVERITY_TONE[n.severity] ?? "neutral"}>{n.severity}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-500">{fmtDateTime(n.created_at)}{n.read_at ? " · read" : ""}</p>
                </div>
                {!n.read_at ? (
                  <ActionButton action={markReadAction.bind(null, n.id)} label="Mark read" variant="ghost" size="sm" />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
