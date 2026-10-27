import { getCurrentActor } from "@/server/auth";
import { getDb } from "@/server/db";
import { canViewRecord } from "@/server/permissions";
import { audit } from "@/server/audit";

export const dynamic = "force-dynamic";

/**
 * Authorization-checked download. The file is served only if the signed-in user may view the
 * institution that owns it. Responses are sent as attachments, with no-sniff and no-store headers.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getCurrentActor();
  if (!actor) return new Response("Sign in to download files.", { status: 401 });

  const db = await getDb();
  const res = await db.query<{ id: string; name: string; mime: string; data: Uint8Array; institution_id: string; region_id: string }>(
    `SELECT f.id, f.name, f.mime, f.data, f.institution_id, i.region_id
     FROM files f JOIN institutions i ON i.id = f.institution_id WHERE f.id = $1`,
    [id],
  );
  const file = res.rows[0];
  // Not found and not permitted look the same to the caller, so file IDs cannot be probed.
  if (!file || !canViewRecord(actor, { institutionId: file.institution_id, regionId: file.region_id })) {
    return new Response("File not found.", { status: 404 });
  }

  await audit(db, actor, "file.downloaded", "file", id, { name: file.name });
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
