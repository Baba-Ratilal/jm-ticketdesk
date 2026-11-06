import type { NextRequest } from "next/server";
import { isGuid, query } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { getAutoAssign, setSetting } from "@/lib/settings";
import { listStaff, requireAdmin } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin(req);
    return { ...(await getAutoAssign()), staff: await listStaff() };
  });
}

/** Admin: choose who new IT / ERP tickets go to ("" = nobody, leave unassigned). */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    await requireAdmin(req);
    const b = await req.json().catch(() => ({}));
    for (const [field, key] of [["IT", "auto_assign_it"], ["ERP", "auto_assign_erp"]] as const) {
      if (b[field] === undefined) continue;
      const v = b[field] ? String(b[field]) : null;
      if (v) {
        if (!isGuid(v)) throw new HttpError(400, "Invalid person");
        const [u] = await query("SELECT id FROM dbo.users WHERE id=@id AND role IN ('admin','agent') AND active=1", { id: v });
        if (!u) throw new HttpError(400, "Tickets can only go to an active IT-team member or admin");
      }
      await setSetting(key, v);
    }
    return { ok: true };
  });
}
