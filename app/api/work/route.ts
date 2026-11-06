import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { handle } from "@/lib/http";
import { requireStaff } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything assigned to me (tickets + issues), plus the unassigned pool; admins also get a per-person summary. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const me = await requireStaff(req);
    const tickets = await query(
      `SELECT id, ticket_no, type, title, priority, status, created_at, updated_at, CONVERT(varchar(10), target_date, 23) AS target_on
         FROM dbo.tickets WHERE assigned_to=@me AND status NOT IN ('Resolved','Closed')`,
      { me: me.id }
    );
    const issues = await query(
      `SELECT id, issue_no, type, title, priority, status, created_at, updated_at
         FROM dbo.issues WHERE assigned_to=@me AND status NOT IN ('Resolved','Closed')`,
      { me: me.id }
    );
    const [pool] = await query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM dbo.tickets WHERE assigned_to IS NULL AND status NOT IN ('Resolved','Closed')"
    );
    let team: unknown[] = [];
    if (me.role === "admin") {
      team = await query(
        `SELECT u.id, u.full_name, u.login_id, u.role,
                (SELECT COUNT(*) FROM dbo.tickets t WHERE t.assigned_to=u.id AND t.status NOT IN ('Resolved','Closed')) AS tickets,
                (SELECT COUNT(*) FROM dbo.issues i WHERE i.assigned_to=u.id AND i.status NOT IN ('Resolved','Closed')) AS issues,
                (SELECT COUNT(*) FROM dbo.tickets t WHERE t.assigned_to=u.id AND t.status NOT IN ('Resolved','Closed') AND t.priority IN ('High','Critical')) AS urgent
           FROM dbo.users u WHERE u.role IN ('admin','agent') AND u.active=1 ORDER BY u.full_name`
      );
    }
    return { tickets, issues, unassigned: pool.n, team };
  });
}
