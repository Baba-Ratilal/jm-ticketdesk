import { isGuid, query } from "./db";
import { HttpError } from "./http";
import type { DbUser } from "./server";

export const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

/** SQL prefix: a CTE `team` holding everyone below @me in the reporting chain (any depth). */
export const TEAM_CTE = `;WITH team AS (
    SELECT id FROM dbo.users WHERE manager_id = @me
    UNION ALL
    SELECT u.id FROM dbo.users u JOIN team ON u.manager_id = team.id
  )`;
export const TEAM_OPT = "OPTION (MAXRECURSION 30)";

export const TASK_SELECT = `SELECT t.id, t.task_no, t.task, CONVERT(varchar(10), t.given_date, 23) AS given_on,
       t.assigned_to, a.full_name AS assignee_name, t.assigned_by, b.full_name AS assigner_name, t.source,
       CONVERT(varchar(10), t.target_date, 23) AS target_on, t.status, t.remark, CONVERT(varchar(10), t.done_date, 23) AS done_on
  FROM dbo.tasks t JOIN dbo.users a ON a.id = t.assigned_to JOIN dbo.users b ON b.id = t.assigned_by`;

/** Who may see a task: admin, the assignee, the giver, or anyone above the assignee in the hierarchy. */
export async function canSeeTask(taskId: string, me: DbUser): Promise<{ t: any; isTeamLead: boolean }> {
  if (!isGuid(taskId)) throw new HttpError(404, "Task not found");
  const [t] = await query<any>("SELECT id, assigned_to, assigned_by, status, target_date, remark, source, task FROM dbo.tasks WHERE id=@id", { id: taskId });
  if (!t) throw new HttpError(404, "Task not found");
  const [r] = await query<{ n: number }>(`${TEAM_CTE} SELECT COUNT(*) AS n FROM team WHERE id=@to ${TEAM_OPT}`, { me: me.id, to: t.assigned_to });
  const isTeamLead = (r?.n ?? 0) > 0;
  if (me.role !== "admin" && t.assigned_to !== me.id && t.assigned_by !== me.id && !isTeamLead) throw new HttpError(404, "Task not found");
  return { t, isTeamLead };
}

export async function logTaskEvent(taskId: string, actorId: string | null, kind: string, oldV: string | null, newV: string | null) {
  await query("INSERT INTO dbo.task_events (task_id, actor_id, kind, old_value, new_value) VALUES (@t, @a, @k, @o, @n)", {
    t: taskId, a: actorId, k: kind, o: oldV?.slice(0, 1000) ?? null, n: newV?.slice(0, 1000) ?? null,
  });
}

export async function attachHistory<T extends { id: string }>(rows: T[]): Promise<(T & { history: { from: string | null; to: string | null }[] })[]> {
  if (!rows.length) return [];
  const ev = await query<{ task_id: string; old_value: string | null; new_value: string | null }>(
    "SELECT task_id, old_value, new_value FROM dbo.task_events WHERE kind='target' ORDER BY id"
  );
  const by = new Map<string, { from: string | null; to: string | null }[]>();
  for (const e of ev) {
    const k = String(e.task_id).toLowerCase();
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push({ from: e.old_value, to: e.new_value });
  }
  return rows.map((r) => ({ ...r, history: by.get(String(r.id).toLowerCase()) ?? [] }));
}
