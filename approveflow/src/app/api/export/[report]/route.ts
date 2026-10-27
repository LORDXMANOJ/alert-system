import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { ServiceError } from "@/server/errors";
import { REPORT_TYPES, exportReportCsv, type ReportId } from "@/server/services/reports";

export const dynamic = "force-dynamic";

/** Authorized CSV export. The service checks the role and record scope again before any row is written. */
export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  const actor = await getCurrentActor();
  if (!actor) return new Response("Sign in to export reports.", { status: 401 });
  if (!REPORT_TYPES.some((r) => r.id === report)) return new Response("Unknown report.", { status: 404 });

  const url = new URL(req.url);
  try {
    const db = await getDb();
    const csv = await exportReportCsv(db, actor, report as ReportId, {
      regionId: url.searchParams.get("region") || undefined,
      stageRole: url.searchParams.get("stage") || undefined,
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="approveflow-${report}-${stamp}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof ServiceError) return new Response(err.message, { status: err.code === "FORBIDDEN" ? 403 : 400 });
    throw err;
  }
}
