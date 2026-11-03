import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { readStored } from "@/lib/files";
import { handle, HttpError } from "@/lib/http";
import { getVisibleTicket, requireUser, isStaff } from "@/lib/server";
import { isGuid } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves a screenshot, but only to people who can see the ticket. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const params = await ctx.params;
    const me = await requireUser(req);
    if (!isGuid(params.id)) throw new HttpError(404, "Not found");
    const [a] = await query(
      `SELECT a.ticket_id, a.stored_name, a.mime, a.comment_id, c.internal
         FROM dbo.ticket_attachments a LEFT JOIN dbo.ticket_comments c ON c.id = a.comment_id
        WHERE a.id = @id`,
      { id: params.id }
    );
    if (!a) throw new HttpError(404, "Not found");
    await getVisibleTicket(a.ticket_id, me); // 404 if not theirs
    if (a.internal && !isStaff(me)) throw new HttpError(404, "Not found");

    const buf = await readStored(a.ticket_id, a.stored_name);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": a.mime,
        "Content-Length": String(buf.length),
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, max-age=3600",
      },
    });
  });
}
