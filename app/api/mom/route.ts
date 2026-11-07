import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { MOM_STATUSES } from "@/lib/mom";
import { handle, HttpError } from "@/lib/http";
import { checkAssignee, listStaff, requireAdmin, requireStaff } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT = `SELECT m.id, m.sr_no, CONVERT(varchar(10), m.mom_date, 23) AS mom_on, m.point,
       CONVERT(varchar(10), m.target_date, 23) AS target_on, m.status, m.assigned_to,
       a.full_name AS assignee_name, m.remark
  FROM dbo.mom_points m LEFT JOIN dbo.users a ON a.id = m.assigned_to`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export async function GET(req: NextRequest) {
  return handle(async () => {
    const me = await requireStaff(req);
    const items = await query(`${SELECT} ORDER BY m.sr_no`);
    return { items, staff: await listStaff(), canEdit: me.role === "admin" };
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const me = await requireAdmin(req);
    const d = await req.json().catch(() => ({}));
    const point = clean(d.point, 1000);
    if (point.length < 3) throw new HttpError(400, "Write the point");
    if (!DATE_RE.test(String(d.mom_on ?? ""))) throw new HttpError(400, "Choose the MOM date");
    const targetOn = d.target_on ? String(d.target_on) : null;
    if (targetOn && !DATE_RE.test(targetOn)) throw new HttpError(400, "Invalid target date");
    const status = d.status ?? "Open";
    if (!(MOM_STATUSES as readonly string[]).includes(status)) throw new HttpError(400, "Invalid status");
    const assignee = await checkAssignee(d.assigned_to);
    const [row] = await query<{ id: string }>(
      `INSERT INTO dbo.mom_points (mom_date, point, target_date, status, assigned_to, remark, created_by)
       OUTPUT INSERTED.id VALUES (@mom, @point, @target, @status, @assignee, @remark, @me)`,
      { mom: d.mom_on, point, target: targetOn, status, assignee, remark: clean(d.remark, 1000) || null, me: me.id }
    );
    return { id: row.id };
  });
}
