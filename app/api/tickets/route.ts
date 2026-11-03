import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { CATEGORIES, DEPARTMENTS, ERP_MODULES, PRIORITIES, UNITS } from "@/lib/constants";
import { formFiles, prepareFiles, storeFiles } from "@/lib/files";
import { handle, HttpError } from "@/lib/http";
import { notifyInBackground } from "@/lib/notify";
import { isStaff, logEvent, requireUser } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SELECT = `SELECT TOP 2000 t.*, c.full_name AS creator_name, c.email AS creator_email, a.full_name AS assignee_name, a.phone AS assignee_phone
  FROM dbo.tickets t
  JOIN dbo.users c ON c.id = t.created_by
  LEFT JOIN dbo.users a ON a.id = t.assigned_to`;

export async function GET(req: NextRequest) {
  return handle(async () => {
    const me = await requireUser(req);
    if (req.nextUrl.searchParams.get("scope") === "all") {
      if (!isStaff(me)) throw new HttpError(403, "IT team only");
      // admins see everything; IT-team members see their own queue plus the unassigned pool
      const tickets =
        me.role === "admin"
          ? await query(`${SELECT} ORDER BY t.created_at DESC`)
          : await query(`${SELECT} WHERE t.assigned_to=@me OR t.assigned_to IS NULL ORDER BY t.created_at DESC`, {
              me: me.id,
            });
      const admins = await query(
        "SELECT id, email, full_name, phone FROM dbo.users WHERE role IN ('admin','agent') AND active=1 ORDER BY full_name"
      );
      return { tickets, admins };
    }
    const tickets = await query(`${SELECT} WHERE t.created_by=@me ORDER BY t.created_at DESC`, { me: me.id });
    return { tickets };
  });
}

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export async function POST(req: NextRequest) {
  return handle(async () => {
    const me = await requireUser(req);
    const form = await req.formData();
    let d: any;
    try {
      d = JSON.parse(String(form.get("data") || "{}"));
    } catch {
      throw new HttpError(400, "Invalid request");
    }

    const type = d.type;
    if (type !== "IT" && type !== "ERP") throw new HttpError(400, "Choose IT or ERP");
    if (!CATEGORIES[type].includes(d.category)) throw new HttpError(400, "Invalid category");
    if (!(PRIORITIES as readonly string[]).includes(d.priority)) throw new HttpError(400, "Invalid priority");
    if (!UNITS.includes(d.unit) || !DEPARTMENTS.includes(d.department))
      throw new HttpError(400, "Please select your unit and department");
    const description = clean(d.description, 5000);
    if (description.length < 5) throw new HttpError(400, "Please describe the issue");
    // there is no separate title: it is the first line of the description (used in lists and emails)
    const firstLine = description.split(/\r?\n/).find((l) => l.trim()) || description;
    const title = firstLine.trim().replace(/\s+/g, " ").slice(0, 120);
    const erpModule = type === "ERP" && ERP_MODULES.includes(d.erp_module) ? d.erp_module : null;
    const erpScreen = type === "ERP" ? clean(d.erp_screen, 150) || null : null;

    // check the screenshots before saving anything
    const files = await prepareFiles(formFiles(form));

    const [t] = await query<{ id: string }>(
      `INSERT INTO dbo.tickets (type, category, priority, title, description, unit, department, erp_module, erp_screen, created_by)
       OUTPUT INSERTED.id
       VALUES (@type, @category, @priority, @title, @description, @unit, @department, @erpModule, @erpScreen, @me)`,
      {
        type,
        category: d.category,
        priority: d.priority,
        title,
        description,
        unit: d.unit,
        department: d.department,
        erpModule,
        erpScreen,
        me: me.id,
      }
    );

    await storeFiles(t.id, null, me.id, files);
    await query("UPDATE dbo.users SET unit=@unit, department=@department WHERE id=@me", {
      unit: d.unit,
      department: d.department,
      me: me.id,
    });
    await logEvent(t.id, me.id, "created", `${type} · ${d.category} · ${d.priority}`);
    notifyInBackground("created", t.id, me.id);
    return { id: t.id };
  });
}
