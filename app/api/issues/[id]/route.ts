import type { NextRequest } from "next/server";
import { isGuid, query } from "@/lib/db";
import { PRIORITIES, STATUSES } from "@/lib/constants";
import { handle, HttpError } from "@/lib/http";
import { getIssue, listStaff, logIssueEvent, parseClosedOn, requireAdmin, requireStaff } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const params = await ctx.params;
    await requireStaff(req);
    const issue = await getIssue(params.id);
    const comments = await query(
      `SELECT c.id, c.author_id, c.body, c.created_at, u.full_name AS author_name
         FROM dbo.issue_comments c JOIN dbo.users u ON u.id = c.author_id
        WHERE c.issue_id=@i ORDER BY c.created_at`,
      { i: issue.id }
    );
    const events = await query(
      `SELECT e.id, e.action, e.detail, e.created_at, u.full_name AS actor_name
         FROM dbo.issue_events e LEFT JOIN dbo.users u ON u.id = e.actor_id
        WHERE e.issue_id=@i ORDER BY e.created_at`,
      { i: issue.id }
    );
    const tickets = await query(
      `SELECT t.id, t.ticket_no, t.title, t.status, t.priority, t.type
         FROM dbo.issue_tickets it JOIN dbo.tickets t ON t.id = it.ticket_id
        WHERE it.issue_id=@i ORDER BY t.ticket_no`,
      { i: issue.id }
    );
    return { issue, comments, events, tickets, staff: await listStaff() };
  });
}

/** IT team / admin: change status, priority, owner, title or description of an issue. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const params = await ctx.params;
    const me = await requireStaff(req);
    const issue = await getIssue(params.id);
    const body = await req.json().catch(() => ({}));

    if (body.status !== undefined && body.status !== issue.status) {
      if (!(STATUSES as readonly string[]).includes(body.status)) throw new HttpError(400, "Invalid status");
      await query(
        `UPDATE dbo.issues
            SET status=@v, updated_at=SYSUTCDATETIME(),
                resolved_at = CASE WHEN @v IN ('Resolved','Closed') THEN COALESCE(resolved_at, SYSUTCDATETIME()) ELSE NULL END,
                closed_date = CASE WHEN @v IN ('Resolved','Closed') THEN COALESCE(closed_date, CAST(DATEADD(minute, 330, SYSUTCDATETIME()) AS date)) ELSE NULL END
          WHERE id=@id`,
        { v: body.status, id: issue.id }
      );
      await logIssueEvent(issue.id, me.id, "status", `Status → ${body.status}`);
    }

    if (body.closed_on !== undefined) {
      const status = body.status ?? issue.status;
      if (status !== "Resolved" && status !== "Closed") throw new HttpError(400, "Set the status to Resolved or Closed first");
      const day = parseClosedOn(body.closed_on, issue.raised_on, issue.created_at);
      if (day !== (issue.closed_on ?? null)) {
        await query("UPDATE dbo.issues SET closed_date=@d, updated_at=SYSUTCDATETIME() WHERE id=@id", { d: day, id: issue.id });
        await logIssueEvent(issue.id, me.id, "closing date", `Closing date → ${day}`);
      }
    }

    if (body.priority !== undefined && body.priority !== issue.priority) {
      if (!(PRIORITIES as readonly string[]).includes(body.priority)) throw new HttpError(400, "Invalid priority");
      await query("UPDATE dbo.issues SET priority=@v, updated_at=SYSUTCDATETIME() WHERE id=@id", { v: body.priority, id: issue.id });
      await logIssueEvent(issue.id, me.id, "priority", `Priority → ${body.priority}`);
    }

    if (body.assigned_to !== undefined && (body.assigned_to || null) !== issue.assigned_to) {
      let name = "nobody";
      if (body.assigned_to) {
        const [a] = await query<{ full_name: string | null; login_id: string | null }>(
          "SELECT full_name, login_id FROM dbo.users WHERE id=@id AND role IN ('admin','agent') AND active=1",
          { id: String(body.assigned_to) }
        );
        if (!a) throw new HttpError(400, "An issue can only be assigned to an active IT-team member or admin");
        name = a.full_name || a.login_id || "someone";
      }
      await query("UPDATE dbo.issues SET assigned_to=@v, updated_at=SYSUTCDATETIME() WHERE id=@id", {
        v: body.assigned_to ? String(body.assigned_to) : null,
        id: issue.id,
      });
      await logIssueEvent(issue.id, me.id, "assigned", `Assigned to ${name}`);
    }

    if (body.title !== undefined || body.description !== undefined) {
      const title = body.title !== undefined ? String(body.title).trim().slice(0, 150) : issue.title;
      const description = body.description !== undefined ? String(body.description).trim().slice(0, 5000) : issue.description;
      if (title.length < 3) throw new HttpError(400, "Give the issue a short title");
      if (title !== issue.title || description !== issue.description) {
        await query("UPDATE dbo.issues SET title=@t, description=@d, updated_at=SYSUTCDATETIME() WHERE id=@id", { t: title, d: description, id: issue.id });
        await logIssueEvent(issue.id, me.id, "edited", "Title or description changed");
      }
    }
    return { ok: true };
  });
}

/** Admin only: permanently delete an issue with its notes, history and ticket links (the tickets stay). */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    await requireAdmin(req);
    if (!isGuid(id)) throw new HttpError(404, "Not found");
    const [i] = await query("SELECT id FROM dbo.issues WHERE id=@id", { id });
    if (!i) throw new HttpError(404, "Not found");
    await query(
      `SET XACT_ABORT ON;
       BEGIN TRAN;
         DELETE FROM dbo.issue_comments WHERE issue_id=@id;
         DELETE FROM dbo.issue_events   WHERE issue_id=@id;
         DELETE FROM dbo.issue_tickets  WHERE issue_id=@id;
         DELETE FROM dbo.issues WHERE id=@id;
       COMMIT;`,
      { id }
    );
    return { ok: true };
  });
}
