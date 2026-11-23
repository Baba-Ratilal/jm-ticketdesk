import type { NextRequest } from "next/server";
import { isGuid, query } from "@/lib/db";
import { getDeviceApprovers } from "@/lib/device-server";
import { handle, HttpError } from "@/lib/http";
import { setSetting } from "@/lib/settings";
import { requireAdmin, requireUser } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everyone: the people a requester can pick as Department Head, and who the fixed HR / Management approvers are. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const me = await requireUser(req);
    const people = await query<any>("SELECT id, full_name, login_id, department FROM dbo.users WHERE active=1 ORDER BY full_name");
    return { people, ...(await getDeviceApprovers()), canEdit: me.role === "admin" };
  });
}

/** Admin: set the fixed HR and Management approvers. */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    await requireAdmin(req);
    const b = await req.json().catch(() => ({}));
    for (const [field, key] of [["hr", "device_hr"], ["mgmt", "device_mgmt"]] as const) {
      if (b[field] === undefined) continue;
      const v = b[field] ? String(b[field]) : null;
      if (v) {
        if (!isGuid(v)) throw new HttpError(400, "Invalid person");
        const [u] = await query("SELECT id FROM dbo.users WHERE id=@id AND active=1", { id: v });
        if (!u) throw new HttpError(400, "Choose an active user");
      }
      await setSetting(key, v);
    }
    return { ok: true };
  });
}
