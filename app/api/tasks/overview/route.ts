import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { handle } from "@/lib/http";
import { requireUser } from "@/lib/server";
import { istToday, TEAM_CTE, TEAM_OPT } from "@/lib/tasks-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COUNTS = `COUNT(CASE WHEN t.status IN ('Open','In Progress') THEN 1 END) AS open_n,
  COUNT(CASE WHEN t.status IN ('Open','In Progress') AND t.target_date < @today THEN 1 END) AS overdue,
  COUNT(CASE WHEN t.status IN ('Open','In Progress') AND t.target_date = @today THEN 1 END) AS due_today,
  COUNT(CASE WHEN t.status IN ('Open','In Progress') AND t.target_date IS NULL THEN 1 END) AS no_target,
  COUNT(CASE WHEN t.status = 'Not mine' THEN 1 END) AS not_mine,
  COUNT(CASE WHEN t.status = 'Done' THEN 1 END) AS done_n`;

/** Counts for the Overview: my tasks, tasks I gave, and (for managers) the team. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const me = await requireUser(req);
    const p = { me: me.id, today: istToday() };
    const [mine] = await query<any>(`SELECT ${COUNTS} FROM dbo.tasks t WHERE t.assigned_to=@me`, p);
    const [given] = await query<any>(`SELECT ${COUNTS} FROM dbo.tasks t WHERE t.assigned_by=@me AND t.assigned_to<>@me`, p);
    const members = await query<any>(
      `${TEAM_CTE}
       SELECT u.id, COALESCE(NULLIF(u.full_name,''), u.login_id) AS name, ${COUNTS}
         FROM dbo.users u LEFT JOIN dbo.tasks t ON t.assigned_to = u.id
        WHERE u.id IN (SELECT id FROM team) AND u.active=1
        GROUP BY u.id, u.full_name, u.login_id ORDER BY 2 ${TEAM_OPT}`, p);
    const team = members.reduce(
      (a: any, m: any) => ({ open_n: a.open_n + m.open_n, overdue: a.overdue + m.overdue, due_today: a.due_today + m.due_today, not_mine: a.not_mine + m.not_mine, done_n: a.done_n + m.done_n }),
      { open_n: 0, overdue: 0, due_today: 0, not_mine: 0, done_n: 0 }
    );
    return { mine, given, team: members.length ? team : null, members };
  });
}
