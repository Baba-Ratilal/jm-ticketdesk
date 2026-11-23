import type { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";
import { isGuid, query } from "@/lib/db";
import { getDeviceRequest, logDeviceEvent, storeProof } from "@/lib/device-server";
import { prepareFiles, uploadDir } from "@/lib/files";
import { STAGES } from "@/lib/device";
import { handle, HttpError } from "@/lib/http";
import { parseRaisedOn, requireAdmin, requireUser } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const me = await requireUser(req);
    if (!isGuid(id)) throw new HttpError(404, "Not found");
    return { request: await getDeviceRequest(id, me) };
  });
}

/** action: approve | reject (the current approver or an admin) · cancel (requester or admin) · issue (IT team: asset tag + date for one row). */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const me = await requireUser(req);
    if (!isGuid(id)) throw new HttpError(404, "Not found");
    // approve / reject may arrive as a form (with an approval image); everything else is JSON
    let b: any = {};
    let proof: File | null = null;
    if ((req.headers.get("content-type") || "").startsWith("multipart/")) {
      const fd = await req.formData();
      b = { action: fd.get("action"), remark: fd.get("remark") };
      const f = fd.get("proof");
      if (f instanceof File && f.size > 0) proof = f;
    } else {
      b = await req.json().catch(() => ({}));
    }
    const r = await getDeviceRequest(id, me);
    const isAdmin = me.role === "admin";
    const staff = isAdmin || me.role === "agent";
    const pending = r.status.startsWith("Pending");

    if (b.action === "approve" || b.action === "reject") {
      if (!pending) throw new HttpError(400, "This request is not waiting for approval");
      const cur = r.approvals.find((a) => !a.decision);
      if (!cur) throw new HttpError(400, "Nothing to approve");
      if (cur.approver_id !== me.id && !isAdmin) throw new HttpError(403, `Only ${cur.approver_name || "the assigned approver"} can decide this stage`);
      const remark = String(b.remark ?? "").trim().slice(0, 500);
      const reject = b.action === "reject";
      if (reject && remark.length < 3) throw new HttpError(400, "Write the reason for rejecting");
      const onBehalf = cur.approver_id !== me.id; // an admin recording an approval someone gave outside the app
      if (onBehalf && !reject && !proof) throw new HttpError(400, `Attach an image of ${cur.approver_name || "the approver"}'s approval (signed form or message) to approve on their behalf`);
      const prepared = proof ? (await prepareFiles([proof]))[0] : null;
      const label = STAGES.find((s) => s.stage === cur.stage)!.label;
      const next = reject ? "Rejected" : cur.stage === 1 ? "Pending HR" : cur.stage === 2 ? "Pending Management" : "Approved";
      await query(
        `SET XACT_ABORT ON;
         BEGIN TRAN;
         UPDATE dbo.device_request_approvals SET decision=@dec, decided_by=@me, decided_at=SYSUTCDATETIME(), remark=@remark
          WHERE request_id=@id AND stage=@stage AND decision IS NULL;
         UPDATE dbo.device_requests SET status=@next, updated_at=SYSUTCDATETIME() WHERE id=@id;
         COMMIT;`,
        { dec: reject ? "Rejected" : "Approved", me: me.id, remark: remark || null, id, stage: cur.stage, next }
      );
      if (prepared) await storeProof(id, cur.stage, me.id, prepared);
      await logDeviceEvent(
        id, me.id, reject ? "rejected" : "approved",
        `${label}${onBehalf ? ` (on behalf of ${cur.approver_name})` : ""}${prepared ? " · proof attached" : ""}${remark ? `: ${remark}` : ""}`
      );
      return { ok: true };
    }

    if (b.action === "cancel") {
      if (r.requested_by !== me.id && !isAdmin) throw new HttpError(403, "Only the requester can cancel");
      if (!pending) throw new HttpError(400, "Only a request that is still waiting for approval can be cancelled");
      await query("UPDATE dbo.device_requests SET status='Cancelled', updated_at=SYSUTCDATETIME() WHERE id=@id", { id });
      await logDeviceEvent(id, me.id, "cancelled");
      return { ok: true };
    }

    if (b.action === "issue") {
      if (!staff) throw new HttpError(403, "Only the IT team can record issued devices");
      if (r.status !== "Approved" && r.status !== "Issued") throw new HttpError(400, "Devices can be issued only after the request is fully approved");
      const item = r.items.find((i) => i.id === b.item_id);
      if (!item) throw new HttpError(404, "Row not found");
      const tag = String(b.asset_tag ?? "").trim().slice(0, 200);
      if (tag.length < 2) throw new HttpError(400, "Enter the asset tag / serial number");
      const on = parseRaisedOn(b.issued_on);
      if (!on) throw new HttpError(400, "Choose the issued-on date");
      await query(
        `SET XACT_ABORT ON;
         BEGIN TRAN;
         UPDATE dbo.device_request_items SET asset_tag=@tag, issued_on=@on, issued_by=@me WHERE id=@item AND request_id=@id;
         UPDATE dbo.device_requests
            SET status = CASE WHEN EXISTS (SELECT 1 FROM dbo.device_request_items WHERE request_id=@id AND issued_on IS NULL) THEN 'Approved' ELSE 'Issued' END,
                updated_at = SYSUTCDATETIME()
          WHERE id=@id;
         COMMIT;`,
        { tag, on, me: me.id, item: item.id, id }
      );
      await logDeviceEvent(id, me.id, "issued", `Row ${item.sr_no} (${item.employee_name}): ${tag}`);
      return { ok: true };
    }
    throw new HttpError(400, "Unknown action");
  });
}

/** Admin only: delete a request permanently. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    await requireAdmin(req);
    if (!isGuid(id)) throw new HttpError(404, "Not found");
    await query(
      `SET XACT_ABORT ON;
       BEGIN TRAN;
         DELETE FROM dbo.device_request_files     WHERE request_id=@id;
         DELETE FROM dbo.device_request_events    WHERE request_id=@id;
         DELETE FROM dbo.device_request_approvals WHERE request_id=@id;
         DELETE FROM dbo.device_request_items     WHERE request_id=@id;
         DELETE FROM dbo.device_requests          WHERE id=@id;
       COMMIT;`,
      { id }
    );
    await fs.rm(path.resolve(uploadDir(), "device", id), { recursive: true, force: true }).catch(() => {});
    return { ok: true };
  });
}
