import type { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { requireUser } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const u = await requireUser(req, { allowPending: true });
    return { source: u.source, must_change_password: u.must_change_password, id: u.id, login_id: u.login_id, email: u.email, full_name: u.full_name, role: u.role, phone: u.phone, unit: u.unit, department: u.department };
  });
}
