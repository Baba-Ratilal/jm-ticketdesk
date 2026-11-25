import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { BULK_KINDS, buildWorkbook, exportRows, importRows, type BulkKind } from "@/lib/bulk";
import { getMasterLists } from "@/lib/masters";
import { handle, HttpError } from "@/lib/http";
import { requireAdmin, requireStaff } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const kindOf = async (ctx: { params: Promise<{ kind: string }> }): Promise<BulkKind> => {
  const { kind } = await ctx.params;
  if (!(BULK_KINDS as string[]).includes(kind)) throw new HttpError(404, "Not found");
  return kind as BulkKind;
};

/** Download all rows as an Excel file, or (?template=1) an empty template with a Read-me sheet. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  return handle(async () => {
    const me = await requireStaff(req);
    const kind = await kindOf(ctx);
    const template = req.nextUrl.searchParams.get("template") === "1";
    if (template && me.role !== "admin") throw new HttpError(403, "Admins only");
    const buf = template ? await buildWorkbook(kind, null, await getMasterLists()) : await buildWorkbook(kind, await exportRows(kind, me));
    const stamp = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${template ? `${kind}-import-template` : `${kind}-${stamp}`}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  });
}

/** Admin only. multipart: file, dry=1 to check without saving. Rejects the whole file if any row is wrong. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  return handle(async () => {
    const me = await requireAdmin(req);
    const kind = await kindOf(ctx);
    const fd = await req.formData();
    const f = fd.get("file");
    if (!(f instanceof File) || f.size === 0) throw new HttpError(400, "Choose an Excel (.xlsx) file");
    if (f.size > 5 * 1024 * 1024) throw new HttpError(400, "File is larger than 5 MB");
    const r = await importRows(kind, Buffer.from(await f.arrayBuffer()), me, fd.get("dry") === "1");
    return r;
  });
}
