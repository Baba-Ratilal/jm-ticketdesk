import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { getIssue, logIssueEvent, requireStaff } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const params = await ctx.params;
    const me = await requireStaff(req);
    const issue = await getIssue(params.id);
    const body = await req.json().catch(() => ({}));
    const text = String(body.body ?? "").trim().slice(0, 5000);
    if (!text) throw new HttpError(400, "Write a note first");
    await query("INSERT INTO dbo.issue_comments (issue_id, author_id, body) VALUES (@i, @a, @b)", { i: issue.id, a: me.id, b: text });
    await query("UPDATE dbo.issues SET updated_at=SYSUTCDATETIME() WHERE id=@id", { id: issue.id });
    await logIssueEvent(issue.id, me.id, "comment", "Note added");
    return { ok: true };
  });
}
