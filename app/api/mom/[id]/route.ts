import type { NextRequest } from "next/server";
import { query, isGuid } from "@/lib/db";
import { MOM_STATUSES } from "@/lib/mom";
import { handle, HttpError } from "@/lib/http";
import { checkAssignee, requireAdmin, requireStaff } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

// Admin: every field. IT team: status and remark only.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const me = await requireStaff(req);
    if (!isGuid(id)) throw new HttpError(404, "Not found");
    const d = await req.json().catch(() => ({}));
    const sets: string[] = [];
    const p: Record<string, unknown> = { id };

    if ("status" in d) {
      if (!(MOM_STATUSES as readonly string[]).includes(d.status)) throw new HttpError(400, "Invalid status");
      sets.push("status=@status"); p.status = d.status;
    }
    if ("remark" in d) { sets.push("remark=@remark"); p.remark = clean(d.remark, 1000) || null; }

    const adminOnly = ["mom_on", "point", "target_on", "assigned_to"].some((k) => k in d);
    if (adminOnly) {
      if (me.role !== "admin") throw new HttpError(403, "Only admins can change the point, dates or owner");
      if ("mom_on" in d) {
        if (!DATE_RE.test(String(d.mom_on))) throw new HttpError(400, "Invalid MOM date");
        sets.push("mom_date=@mom"); p.mom = d.mom_on;
      }
      if ("point" in d) {
        const pt = clean(d.point, 1000);
        if (pt.length < 3) throw new HttpError(400, "Write the point");
        sets.push("point=@point"); p.point = pt;
      }
      if ("target_on" in d) {
        if (d.target_on && !DATE_RE.test(String(d.target_on))) throw new HttpError(400, "Invalid target date");
        sets.push("target_date=@target"); p.target = d.target_on || null;
      }
      if ("assigned_to" in d) { sets.push("assigned_to=@assignee"); p.assignee = await checkAssignee(d.assigned_to); }
    }
    if (!sets.length) throw new HttpError(400, "Nothing to change");
    const r = await query<{ id: string }>(`UPDATE dbo.mom_points SET ${sets.join(", ")}, updated_at=SYSUTCDATETIME() OUTPUT INSERTED.id WHERE id=@id`, p);
    if (!r.length) throw new HttpError(404, "Not found");
    return { ok: true };
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    await requireAdmin(req);
    if (!isGuid(id)) throw new HttpError(404, "Not found");
    await query("DELETE FROM dbo.mom_points WHERE id=@id", { id });
    return { ok: true };
  });
}
