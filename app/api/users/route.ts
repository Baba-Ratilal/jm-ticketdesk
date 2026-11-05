import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { handle } from "@/lib/http";
import { requireAdmin } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin(req);
    const users = await query(
      "SELECT id, login_id, email, source, full_name, role, phone, unit, department, active, last_login FROM dbo.users ORDER BY full_name"
    );
    return { users };
  });
}
