import type { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";
import { isGuid, query } from "@/lib/db";
import { getDeviceRequest } from "@/lib/device-server";
import { uploadDir } from "@/lib/files";
import { handle, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves an approval-proof image, only to people who can see the request. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ fid: string }> }) {
  return handle(async () => {
    const { fid } = await ctx.params;
    const me = await requireUser(req);
    if (!isGuid(fid)) throw new HttpError(404, "Not found");
    const [f] = await query<any>("SELECT request_id, stored_name, mime FROM dbo.device_request_files WHERE id=@id", { id: fid });
    if (!f) throw new HttpError(404, "Not found");
    await getDeviceRequest(f.request_id, me); // 404 if not theirs
    const base = uploadDir();
    const full = path.resolve(base, "device", f.request_id, f.stored_name);
    if (!full.startsWith(base + path.sep)) throw new HttpError(404, "Not found");
    const buf = await fs.readFile(full);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": f.mime,
        "Content-Length": String(buf.length),
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, max-age=3600",
      },
    });
  });
}
