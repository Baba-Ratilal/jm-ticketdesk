import type { NextRequest } from "next/server";
import { isGuid, query } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { getIssue, getVisibleTicket, logIssueEvent, requireStaff } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Link a ticket to this issue, by ticket number. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const params = await ctx.params;
    const me = await requireStaff(req);
    const issue = await getIssue(params.id);
    const body = await req.json().catch(() => ({}));
    const no = Number(String(body.ticket_no ?? "").replace(/[^0-9]/g, ""));
    if (!Number.isInteger(no) || no <= 0) throw new HttpError(400, "Enter a ticket number");

    const [found] = await query<{ id: string }>("SELECT id FROM dbo.tickets WHERE ticket_no=@n", { n: no });
    if (!found) throw new HttpError(404, `Ticket #${no} was not found`);
    const t = await getVisibleTicket(found.id, me); // same visibility rules as the ticket itself
    const [already] = await query("SELECT 1 AS x FROM dbo.issue_tickets WHERE issue_id=@i AND ticket_id=@t", { i: issue.id, t: t.id });
    if (already) throw new HttpError(400, `Ticket #${no} is already linked`);

    await query("INSERT INTO dbo.issue_tickets (issue_id, ticket_id, linked_by) VALUES (@i, @t, @u)", { i: issue.id, t: t.id, u: me.id });
    await query("UPDATE dbo.issues SET updated_at=SYSUTCDATETIME() WHERE id=@id", { id: issue.id });
    await logIssueEvent(issue.id, me.id, "ticket linked", `Ticket #${no}`);
    return { ok: true };
  });
}

/** Unlink: DELETE /api/issues/<id>/tickets?ticket_id=<ticket guid> */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const params = await ctx.params;
    const me = await requireStaff(req);
    const issue = await getIssue(params.id);
    const tid = req.nextUrl.searchParams.get("ticket_id") || "";
    if (!isGuid(tid)) throw new HttpError(400, "Invalid ticket");
    const [t] = await query<{ ticket_no: number }>("SELECT ticket_no FROM dbo.tickets WHERE id=@t", { t: tid });
    await query("DELETE FROM dbo.issue_tickets WHERE issue_id=@i AND ticket_id=@t", { i: issue.id, t: tid });
    await logIssueEvent(issue.id, me.id, "ticket unlinked", t ? `Ticket #${t.ticket_no}` : undefined);
    return { ok: true };
  });
}
