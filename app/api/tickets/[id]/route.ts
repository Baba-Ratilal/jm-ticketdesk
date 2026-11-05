import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { PRIORITIES, STATUSES } from "@/lib/constants";
import { handle, HttpError } from "@/lib/http";
import { notifyInBackground } from "@/lib/notify";
import { getVisibleTicket, isStaff, logEvent, requireStaff, requireUser } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const params = await ctx.params;
    const me = await requireUser(req);
    const ticket = await getVisibleTicket(params.id, me);
    const isAdmin = isStaff(me); // admins and IT team see internal notes

    const comments = await query(
      `SELECT c.id, c.author_id, c.body, c.internal, c.created_at, u.full_name AS author_name, u.role AS author_role
         FROM dbo.ticket_comments c JOIN dbo.users u ON u.id = c.author_id
        WHERE c.ticket_id = @t ${isAdmin ? "" : "AND c.internal = 0"}
        ORDER BY c.created_at`,
      { t: ticket.id }
    );
    const attachments = await query(
      `SELECT id, comment_id, file_name, mime FROM dbo.ticket_attachments
        WHERE ticket_id = @t
          ${isAdmin ? "" : "AND (comment_id IS NULL OR comment_id IN (SELECT id FROM dbo.ticket_comments WHERE internal = 0))"}
        ORDER BY created_at`,
      { t: ticket.id }
    );
    const events = await query(
      `SELECT e.id, e.action, e.detail, e.created_at, u.full_name AS actor_name
         FROM dbo.ticket_events e LEFT JOIN dbo.users u ON u.id = e.actor_id
        WHERE e.ticket_id = @t ${isAdmin ? "" : "AND NOT (e.action = 'comment' AND e.detail = 'Internal note')"}
        ORDER BY e.created_at`,
      { t: ticket.id }
    );
    const admins = isAdmin
      ? await query(
          "SELECT id, email, full_name, phone FROM dbo.users WHERE role IN ('admin','agent') AND active=1 ORDER BY full_name"
        )
      : [];
    const issues = isAdmin
      ? await query(
          `SELECT i.id, i.issue_no, i.title, i.status
             FROM dbo.issue_tickets it JOIN dbo.issues i ON i.id = it.issue_id
            WHERE it.ticket_id = @t ORDER BY i.issue_no`,
          { t: ticket.id }
        )
      : [];
    return { ticket, comments, attachments, events, admins, issues };
  });
}

/**
 * IT team / admin: change status, priority or assignee.
 * IT-team members can only work on tickets assigned to them or unassigned, may assign a ticket to themselves,
 * and may hand their own ticket back to the pool. Admins can assign to anyone.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const params = await ctx.params;
    const me = await requireStaff(req);
    const ticket = await getVisibleTicket(params.id, me);
    if (me.role === "agent" && ticket.assigned_to && ticket.assigned_to !== me.id)
      throw new HttpError(403, "This ticket is assigned to someone else");
    const body = await req.json().catch(() => ({}));

    if (body.status !== undefined && body.status !== ticket.status) {
      if (!(STATUSES as readonly string[]).includes(body.status)) throw new HttpError(400, "Invalid status");
      await query(
        `UPDATE dbo.tickets
            SET status=@v, updated_at=SYSUTCDATETIME(),
                resolved_at = CASE WHEN @v IN ('Resolved','Closed') THEN COALESCE(resolved_at, SYSUTCDATETIME()) ELSE NULL END
          WHERE id=@id`,
        { v: body.status, id: ticket.id }
      );
      await logEvent(ticket.id, me.id, "status", `Status → ${body.status}`);
      notifyInBackground("status", ticket.id, me.id, { status: body.status });
    }

    if (body.priority !== undefined && body.priority !== ticket.priority) {
      if (!(PRIORITIES as readonly string[]).includes(body.priority)) throw new HttpError(400, "Invalid priority");
      await query("UPDATE dbo.tickets SET priority=@v, updated_at=SYSUTCDATETIME() WHERE id=@id", {
        v: body.priority,
        id: ticket.id,
      });
      await logEvent(ticket.id, me.id, "priority", `Priority → ${body.priority}`);
    }

    if (body.assigned_to !== undefined && (body.assigned_to || null) !== ticket.assigned_to) {
      let name = "nobody";
      if (me.role === "agent") {
        const claiming = String(body.assigned_to) === me.id && !ticket.assigned_to;
        const releasing = !body.assigned_to && ticket.assigned_to === me.id;
        if (!claiming && !releasing) throw new HttpError(403, "You can only assign a ticket to yourself");
      }
      if (body.assigned_to) {
        const [a] = await query<{ full_name: string | null; email: string }>(
          "SELECT full_name, email FROM dbo.users WHERE id=@id AND role IN ('admin','agent') AND active=1",
          { id: String(body.assigned_to) }
        );
        if (!a) throw new HttpError(400, "Tickets can only be assigned to an active IT-team member or admin");
        name = a.full_name || a.email;
      }
      await query("UPDATE dbo.tickets SET assigned_to=@v, updated_at=SYSUTCDATETIME() WHERE id=@id", {
        v: body.assigned_to ? String(body.assigned_to) : null,
        id: ticket.id,
      });
      await logEvent(ticket.id, me.id, "assigned", `Assigned to ${name}`);
      if (body.assigned_to) notifyInBackground("assigned", ticket.id, me.id);
    }
    return { ok: true };
  });
}
