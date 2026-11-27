import type { NextRequest } from "next/server";
import { isGuid, query } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import type { MasterKind } from "@/lib/master-kinds";
import { requireAdmin } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Where each list's value is copied as text, so a rename can update the existing records too. */
const USED_IN: Record<MasterKind, { table: string; col: string; where?: string }[]> = {
  unit: [{ table: "dbo.tickets", col: "unit" }, { table: "dbo.users", col: "unit" }, { table: "dbo.device_request_items", col: "unit" }],
  department: [{ table: "dbo.tickets", col: "department" }, { table: "dbo.users", col: "department" }, { table: "dbo.device_request_items", col: "department" }],
  designation: [{ table: "dbo.users", col: "designation" }, { table: "dbo.device_request_items", col: "designation" }],
  it_category: [{ table: "dbo.tickets", col: "category", where: "type='IT'" }],
  erp_category: [{ table: "dbo.tickets", col: "category", where: "type='ERP'" }],
  erp_module: [{ table: "dbo.tickets", col: "erp_module" }, { table: "dbo.issues", col: "erp_module" }],
  task_source: [{ table: "dbo.tasks", col: "source" }],
};

async function load(id: string) {
  if (!isGuid(id)) throw new HttpError(404, "Not found");
  const [m] = await query<{ id: string; kind: MasterKind; value: string; sort_order: number }>("SELECT id, kind, value, sort_order FROM dbo.masters WHERE id=@id", { id });
  if (!m) throw new HttpError(404, "Not found");
  return m;
}

/** Admin: rename (existing records are updated too), switch on/off, or move up/down. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    await requireAdmin(req);
    const m = await load(id);
    const b = await req.json().catch(() => ({}));

    if (b.value !== undefined) {
      const value = String(b.value).trim().replace(/\s+/g, " ").slice(0, 100);
      if (!value) throw new HttpError(400, "Enter a value");
      if (value !== m.value) {
        const [dup] = await query("SELECT id FROM dbo.masters WHERE kind=@k AND value=@v AND id<>@id", { k: m.kind, v: value, id });
        if (dup) throw new HttpError(409, "That value is already in the list");
        const updates = USED_IN[m.kind]
          .map((u) => `IF OBJECT_ID('${u.table}') IS NOT NULL UPDATE ${u.table} SET ${u.col}=@new WHERE ${u.col}=@old${u.where ? ` AND ${u.where}` : ""};`)
          .join("\n");
        await query(`SET XACT_ABORT ON; BEGIN TRAN; UPDATE dbo.masters SET value=@new WHERE id=@id; ${updates} COMMIT;`, { new: value, old: m.value, id });
      }
    }
    if (b.active !== undefined) {
      if (typeof b.active !== "boolean") throw new HttpError(400, "Invalid value");
      await query("UPDATE dbo.masters SET active=@a WHERE id=@id", { a: b.active ? 1 : 0, id });
    }
    if (b.move === "up" || b.move === "down") {
      // swap places with the neighbour, then renumber so the order stays clean
      await query(
        `SET XACT_ABORT ON; BEGIN TRAN;
         ;WITH o AS (SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, value) AS rn FROM dbo.masters WHERE kind=@k)
         UPDATE m SET sort_order = CASE
             WHEN m.id=@id THEN (SELECT rn FROM o WHERE id=@id) + @d
             WHEN m.id=(SELECT id FROM o WHERE rn=(SELECT rn FROM o WHERE id=@id) + @d) THEN (SELECT rn FROM o WHERE id=@id)
             ELSE o.rn END * 10
         FROM dbo.masters m JOIN o ON o.id = m.id;
         COMMIT;`,
        { k: m.kind, id, d: b.move === "up" ? -1 : 1 }
      );
    }
    return { ok: true };
  });
}

/** Admin: remove a value from the list. Existing tickets keep the text they were saved with. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    await requireAdmin(req);
    const m = await load(id);
    const [{ n }] = await query<{ n: number }>("SELECT COUNT(*) AS n FROM dbo.masters WHERE kind=@k AND active=1 AND id<>@id", { k: m.kind, id });
    if (n < 1) throw new HttpError(400, "A list needs at least one active value");
    await query("DELETE FROM dbo.masters WHERE id=@id", { id });
    return { ok: true };
  });
}
