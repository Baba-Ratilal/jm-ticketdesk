import type { NextRequest } from "next/server";
import { isGuid, query } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { getMasterLists } from "@/lib/masters";
import { requireAdmin, requireUser } from "@/lib/server";
import { TASK_STATUSES } from "@/lib/tasks";
import { canSeeTask, istToday, logTaskEvent } from "@/lib/tasks-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const day = (v: any) => (v ? new Date(v.getTime ? v.getTime() : v).toISOString().slice(0, 10) : null);

/** Dated history of target-date, status and remark changes. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const me = await requireUser(req);
    await canSeeTask(id, me);
    const events = await query(
      `SELECT e.id, e.kind, e.old_value, e.new_value, u.full_name AS actor_name, e.created_at
         FROM dbo.task_events e LEFT JOIN dbo.users u ON u.id = e.actor_id WHERE e.task_id=@id ORDER BY e.id`, { id });
    return { events };
  });
}

/**
 * The task text, person and source are locked: only an admin can change them.
 * The assignee (or admin) updates status and remark; the assignee, the giver or an admin moves the target date (every change is kept).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const me = await requireUser(req);
    const { t } = await canSeeTask(id, me);
    const b = await req.json().catch(() => ({}));
    const isAdmin = me.role === "admin";
    const isAssignee = t.assigned_to === me.id;
    const sets: string[] = [];
    const p: Record<string, unknown> = { id };

    if (b.status !== undefined) {
      if (!isAssignee && !isAdmin) throw new HttpError(403, "Only the person the task is given to can change its status");
      if (!(TASK_STATUSES as readonly string[]).includes(b.status)) throw new HttpError(400, "Invalid status");
      if (b.status !== t.status) {
        sets.push("status=@status", b.status === "Done" ? "done_date=@today" : "done_date=NULL");
        p.status = b.status; p.today = istToday();
        await logTaskEvent(id, me.id, "status", t.status, b.status);
      }
    }
    if (b.remark !== undefined) {
      if (!isAssignee && !isAdmin) throw new HttpError(403, "Only the person the task is given to can write the remark");
      const r = String(b.remark ?? "").trim().slice(0, 1000);
      if (r !== (t.remark ?? "")) {
        sets.push("remark=@remark"); p.remark = r || null;
        await logTaskEvent(id, me.id, "remark", t.remark ?? null, r || null);
      }
    }
    if (b.target_on !== undefined) {
      if (!isAssignee && !isAdmin && t.assigned_by !== me.id) throw new HttpError(403, "You cannot change this target date");
      const v = b.target_on ? String(b.target_on) : null;
      if (v && (!DATE_RE.test(v) || v < "2020-01-01")) throw new HttpError(400, "Invalid target date");
      const old = day(t.target_date);
      if (v !== old) {
        sets.push("target_date=@target"); p.target = v;
        await logTaskEvent(id, me.id, "target", old, v);
      }
    }
    // admin only: the locked fields
    if (b.task !== undefined || b.assigned_to !== undefined || b.source !== undefined) {
      if (!isAdmin) throw new HttpError(403, "Only an admin can edit a task");
      if (b.task !== undefined) {
        const task = String(b.task).trim().slice(0, 1000);
        if (task.length < 3) throw new HttpError(400, "Write the task");
        sets.push("task=@task"); p.task = task;
        await logTaskEvent(id, me.id, "edited", t.task, task);
      }
      if (b.assigned_to !== undefined) {
        if (!isGuid(String(b.assigned_to))) throw new HttpError(400, "Choose a person");
        const [u] = await query<{ full_name: string }>("SELECT full_name FROM dbo.users WHERE id=@id AND active=1", { id: b.assigned_to });
        if (!u) throw new HttpError(400, "Choose an active person");
        sets.push("assigned_to=@to"); p.to = b.assigned_to;
        await logTaskEvent(id, me.id, "edited", "reassigned", u.full_name);
      }
      if (b.source !== undefined) {
        const s = String(b.source ?? "").trim();
        if (s && !(await getMasterLists()).task_source.includes(s)) throw new HttpError(400, "Choose the source from the list");
        sets.push("source=@source"); p.source = s || null;
      }
    }
    if (sets.length) await query(`UPDATE dbo.tasks SET ${sets.join(", ")}, updated_at=SYSUTCDATETIME() WHERE id=@id`, p);
    return { ok: true };
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    await requireAdmin(req);
    if (!isGuid(id)) throw new HttpError(404, "Not found");
    await query("SET XACT_ABORT ON; BEGIN TRAN; DELETE FROM dbo.task_events WHERE task_id=@id; DELETE FROM dbo.tasks WHERE id=@id; COMMIT;", { id });
    return { ok: true };
  });
}
