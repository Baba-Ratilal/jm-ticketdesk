import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { ERP_MODULES, PRIORITIES } from "@/lib/constants";
import { handle, HttpError } from "@/lib/http";
import { getVisibleTicket, listStaff, logIssueEvent, parseRaisedOn, requireStaff } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireStaff(req);
    const issues = await query(
      `SELECT TOP 2000 i.*, CONVERT(varchar(10), i.raised_date, 23) AS raised_on, c.full_name AS creator_name, a.full_name AS assignee_name,
              (SELECT COUNT(*) FROM dbo.issue_tickets x WHERE x.issue_id = i.id) AS ticket_count
         FROM dbo.issues i
         JOIN dbo.users c ON c.id = i.created_by
         LEFT JOIN dbo.users a ON a.id = i.assigned_to
        ORDER BY i.created_at DESC`
    );
    return { issues, staff: await listStaff() };
  });
}

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export async function POST(req: NextRequest) {
  return handle(async () => {
    const me = await requireStaff(req);
    const d = await req.json().catch(() => ({}));

    if (d.type !== "IT" && d.type !== "ERP") throw new HttpError(400, "Choose IT or ERP");
    const title = clean(d.title, 150);
    if (title.length < 3) throw new HttpError(400, "Give the issue a short title");
    const description = clean(d.description, 5000);
    const priority = d.priority ?? "Medium";
    if (!(PRIORITIES as readonly string[]).includes(priority)) throw new HttpError(400, "Invalid priority");
    const erpModule = d.type === "ERP" && ERP_MODULES.includes(d.erp_module) ? d.erp_module : null;

    const raisedOn = parseRaisedOn(d.raised_on);
    let assignee: string | null = null;
    if (d.assigned_to) {
      const [a] = await query("SELECT id FROM dbo.users WHERE id=@id AND role IN ('admin','agent') AND active=1", { id: String(d.assigned_to) });
      if (!a) throw new HttpError(400, "An issue can only be assigned to an active IT-team member or admin");
      assignee = String(d.assigned_to);
    }

    const [row] = await query<{ id: string }>(
      `INSERT INTO dbo.issues (type, title, description, priority, erp_module, created_by, assigned_to, raised_date)
       OUTPUT INSERTED.id
       VALUES (@type, @title, @description, @priority, @erpModule, @me, @assignee,
               ISNULL(@raisedOn, CAST(DATEADD(minute, 330, SYSUTCDATETIME()) AS date)))`,
      { type: d.type, title, description, priority, erpModule, me: me.id, assignee, raisedOn }
    );
    await logIssueEvent(row.id, me.id, "created", `${d.type} · ${priority}`);

    // optionally start with one ticket linked ("create issue from this ticket")
    if (d.ticket_id) {
      const t = await getVisibleTicket(String(d.ticket_id), me);
      await query("INSERT INTO dbo.issue_tickets (issue_id, ticket_id, linked_by) VALUES (@i, @t, @u)", { i: row.id, t: t.id, u: me.id });
      await logIssueEvent(row.id, me.id, "ticket linked", `Ticket #${t.ticket_no}`);
    }
    return { id: row.id };
  });
}
