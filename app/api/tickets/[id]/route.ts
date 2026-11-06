import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { fmtDue, PRIORITIES, STATUSES } from "@/lib/constants";
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
    let target_history: unknown[] = [];
    try {
      target_history = await query(
        `SELECT h.id, CONVERT(varchar(10), h.target_date, 23) AS target_on, CONVERT(varchar(5), h.target_time, 108) AS target_at,
                h.superseded_at, u.full_name AS changed_by
           FROM dbo.ticket_targets h LEFT JOIN dbo.users u ON u.id = h.superseded_by
          WHERE h.ticket_id = @t AND h.superseded_at IS NOT NULL
          ORDER BY h.superseded_at DESC`,
        { t: ticket.id }
      );
    } catch {
      // history table not created yet — the ticket must still open
    }
    return { ticket, comments, attachments, events, admins, issues, target_history };
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

    if (body.target_on !== undefined || body.target_at !== undefined) {
      let day: string | null = body.target_on !== undefined ? (body.target_on ? String(body.target_on).slice(0, 10) : null) : ticket.target_on ?? null;
      let at: string | null = body.target_at !== undefined ? (body.target_at ? String(body.target_at).slice(0, 5) : null) : ticket.target_at ?? null;
      if (!day) at = null; // a time needs a date
      if (day) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) throw new HttpError(400, "Enter a valid date");
        const created = new Date(new Date(ticket.created_at).getTime() + 330 * 60000).toISOString().slice(0, 10); // IST date
        if (day < created) throw new HttpError(400, "The target date cannot be before the ticket was raised");
      }
      if (at && !/^([01]\d|2[0-3]):[0-5]\d$/.test(at)) throw new HttpError(400, "Enter a valid time");
      if (day !== (ticket.target_on ?? null) || at !== (ticket.target_at ?? null)) {
        if (body.confirm !== true) throw new HttpError(400, "Please confirm the target date change");

        // keep the history: the previous target is retired (shown struck through), the new one becomes current
        try {
          if (ticket.target_on) {
            const [cur] = await query<{ id: string }>(
              "SELECT TOP 1 id FROM dbo.ticket_targets WHERE ticket_id=@t AND superseded_at IS NULL ORDER BY set_at DESC",
              { t: ticket.id }
            );
            if (cur) {
              await query("UPDATE dbo.ticket_targets SET superseded_at=SYSUTCDATETIME(), superseded_by=@u WHERE ticket_id=@t AND superseded_at IS NULL", { t: ticket.id, u: me.id });
            } else {
              // a target set before history existed: record it now so it still shows as the earlier one
              await query(
                `INSERT INTO dbo.ticket_targets (ticket_id, target_date, target_time, set_by, set_at, superseded_at, superseded_by)
                 VALUES (@t, CAST(@d AS date), CAST(@tm AS time(0)), NULL, NULL, SYSUTCDATETIME(), @u)`,
                { t: ticket.id, d: ticket.target_on, tm: ticket.target_at ? `${ticket.target_at}:00` : null, u: me.id }
              );
            }
          }
          if (day) {
            await query(
              "INSERT INTO dbo.ticket_targets (ticket_id, target_date, target_time, set_by) VALUES (@t, CAST(@d AS date), CAST(@tm AS time(0)), @u)",
              { t: ticket.id, d: day, tm: at ? `${at}:00` : null, u: me.id }
            );
          }
        } catch (e) {
          console.error("Target history not saved (run deploy/upgrade-target-history.sql?):", e);
        }

        await query(
          "UPDATE dbo.tickets SET target_date=CAST(@d AS date), target_time=CAST(@t AS time(0)), updated_at=SYSUTCDATETIME() WHERE id=@id",
          { d: day, t: at ? `${at}:00` : null, id: ticket.id }
        );
        await logEvent(ticket.id, me.id, "target date", day
            ? ticket.target_on
              ? `Target changed from ${fmtDue(ticket.target_on, ticket.target_at)} to ${fmtDue(day, at)}`
              : `Target set to ${fmtDue(day, at)}`
            : "Target date removed");
      }
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
