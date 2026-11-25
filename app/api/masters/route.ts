import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { MASTER_KINDS, type MasterKind, type MasterRow } from "@/lib/master-kinds";
import { getMasterLists } from "@/lib/masters";
import { requireAdmin, requireUser } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everyone signed in: the active values for the dropdowns. Admin with ?all=1: every row (including switched-off ones). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    if (req.nextUrl.searchParams.get("all") === "1") {
      await requireAdmin(req);
      const rows = await query<MasterRow>("SELECT id, kind, value, sort_order, active FROM dbo.masters ORDER BY kind, sort_order, value");
      return { rows };
    }
    await requireUser(req);
    return { lists: await getMasterLists() };
  });
}

/** Admin: add a value to a list (goes to the end). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    await requireAdmin(req);
    const b = await req.json().catch(() => ({}));
    const kind = b.kind as MasterKind;
    if (!MASTER_KINDS.some((k) => k.kind === kind)) throw new HttpError(400, "Unknown list");
    const value = String(b.value ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
    if (value.length < 1) throw new HttpError(400, "Enter a value");
    const [dup] = await query("SELECT id FROM dbo.masters WHERE kind=@k AND value=@v", { k: kind, v: value });
    if (dup) throw new HttpError(409, "That value is already in the list");
    await query(
      `INSERT INTO dbo.masters (kind, value, sort_order)
       SELECT @k, @v, ISNULL(MAX(sort_order), 0) + 10 FROM dbo.masters WHERE kind=@k`,
      { k: kind, v: value }
    );
    return { ok: true };
  });
}
