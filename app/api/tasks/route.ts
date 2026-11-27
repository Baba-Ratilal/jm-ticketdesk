import type { NextRequest } from "next/server";
import { isGuid, query } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { getMasterLists } from "@/lib/masters";
import { requireUser } from "@/lib/server";
import { attachHistory, logTaskEvent, TASK_SELECT, TEAM_CTE, TEAM_OPT } from "@/lib/tasks-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** view = mine (default) | given | team (everyone below me; &person=<id> for one member) | all (admin). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const me = await requireUser(req);
    const sp = req.nextUrl.searchParams;
    const view = sp.get("view") || "mine";
    const person = sp.get("person");
    const isAdmin = me.role === "admin";

    const [{ n: teamSize }] = await query<{ n: number }>(`${TEAM_CTE} SELECT COUNT(*) AS n FROM team ${TEAM_OPT}`, { me: me.id });
    let where = "t.assigned_to=@me";
    const p: Record<string, unknown> = { me: me.id };
    if (view === "given") where = "t.assigned_by=@me";
    else if (view === "team") {
      where = "t.assigned_to IN (SELECT id FROM team)";
      if (person && isGuid(person)) { where += " AND t.assigned_to=@person"; p.person = person; }
    } else if (view === "all") {
      if (!isAdmin) throw new HttpError(403, "Admins only");
      where = person && isGuid(person) ? "t.assigned_to=@person" : "1=1";
      if (person && isGuid(person)) p.person = person;
    }
    const rows = await query<any>(`${TEAM_CTE} ${TASK_SELECT} WHERE ${where} ORDER BY t.task_no DESC ${TEAM_OPT}`, p);
    const items = await attachHistory(rows);

    const people = await query<{ id: string; name: string }>(
      "SELECT id, COALESCE(NULLIF(full_name,''), login_id) AS name FROM dbo.users WHERE active=1 ORDER BY COALESCE(NULLIF(full_name,''), login_id)"
    );
    const team = teamSize
      ? await query<{ id: string; name: string }>(
          `${TEAM_CTE} SELECT u.id, COALESCE(NULLIF(u.full_name,''), u.login_id) AS name FROM dbo.users u WHERE u.id IN (SELECT id FROM team) AND u.active=1 ORDER BY 2 ${TEAM_OPT}`, { me: me.id })
      : [];
    return { items, people, team, isManager: teamSize > 0, isAdmin, me: me.id, sources: (await getMasterLists()).task_source };
  });
}

/** Anyone signed in can give a task to anyone. The given date is today (India time). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const me = await requireUser(req);
    const d = await req.json().catch(() => ({}));
    const task = String(d.task ?? "").trim().replace(/[ \t]+/g, " ").slice(0, 1000);
    if (task.length < 3) throw new HttpError(400, "Write the task");
    if (!isGuid(String(d.assigned_to ?? ""))) throw new HttpError(400, "Choose who the task is for");
    const [to] = await query("SELECT id FROM dbo.users WHERE id=@id AND active=1", { id: d.assigned_to });
    if (!to) throw new HttpError(400, "Choose an active person");
    const source = String(d.source ?? "").trim();
    if (source && !(await getMasterLists()).task_source.includes(source)) throw new HttpError(400, "Choose the source from the list");
    const target = d.target_on ? String(d.target_on) : null;
    if (target && !DATE_RE.test(target)) throw new HttpError(400, "Invalid target date");
    const [row] = await query<{ id: string }>(
      `INSERT INTO dbo.tasks (task, assigned_to, assigned_by, source, target_date)
       OUTPUT INSERTED.id VALUES (@task, @to, @me, @source, @target)`,
      { task, to: d.assigned_to, me: me.id, source: source || null, target }
    );
    await logTaskEvent(row.id, me.id, "created", null, target);
    return { id: row.id };
  });
}
