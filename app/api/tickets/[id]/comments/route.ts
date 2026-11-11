import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { formFiles, prepareFiles, storeFiles } from "@/lib/files";
import { handle, HttpError } from "@/lib/http";
import { notifyInBackground } from "@/lib/notify";
import { getVisibleTicket, isStaff, logEvent, requireUser } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const params = await ctx.params;
    const me = await requireUser(req);
    const ticket = await getVisibleTicket(params.id, me);
    const isAdmin = isStaff(me);
    if (ticket.status === "Closed") throw new HttpError(400, "This ticket is closed");

    const form = await req.formData();
    const text = String(form.get("body") || "").trim().slice(0, 5000);
    const internal = isAdmin && form.get("internal") === "true";
    const files = await prepareFiles(formFiles(form));
    if (!text && !files.length) throw new HttpError(400, "Write a reply or attach a screenshot");

    const [c] = await query<{ id: string }>(
      `INSERT INTO dbo.ticket_comments (ticket_id, author_id, body, internal)
       OUTPUT INSERTED.id VALUES (@t, @a, @body, @internal)`,
      { t: ticket.id, a: me.id, body: text || "(screenshot)", internal: internal ? 1 : 0 }
    );
    await storeFiles(ticket.id, c.id, me.id, files);
    await query("UPDATE dbo.tickets SET updated_at=SYSUTCDATETIME() WHERE id=@id", { id: ticket.id });
    await logEvent(ticket.id, me.id, "comment", internal ? "Internal note" : "Reply");

    // a reply from the user on a resolved ticket reopens it
    if (!isAdmin && ticket.status === "Resolved") {
      await query("UPDATE dbo.tickets SET status='Open', resolved_at=NULL, closed_date=NULL WHERE id=@id", { id: ticket.id });
      await logEvent(ticket.id, me.id, "status", "Status → Open (reopened by user)");
    }

    if (!internal) notifyInBackground("comment", ticket.id, me.id);
    return { id: c.id };
  });
}
