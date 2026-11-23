import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { query } from "./db";
import { uploadDir, type PreparedFile } from "./files";
import { HttpError } from "./http";
import type { DeviceRequest } from "./device";

type Me = { id: string; role: string };

/** Load one request with items, approvals and history. 404 unless the person may see it. */
export async function getDeviceRequest(id: string, me: Me): Promise<DeviceRequest> {
  const [r] = await query<any>(
    `SELECT d.id, d.req_no, CONVERT(varchar(10), d.requirement_date, 23) AS requirement_on, d.status,
            d.requested_by, u.full_name AS requester_name, d.created_at
       FROM dbo.device_requests d JOIN dbo.users u ON u.id = d.requested_by WHERE d.id=@id`,
    { id }
  );
  if (!r) throw new HttpError(404, "Not found");
  const approvals = await query<any>(
    `SELECT a.stage, a.approver_id, ap.full_name AS approver_name, a.decision, db.full_name AS decided_by_name, a.decided_at, a.remark,
            (SELECT TOP 1 CAST(f.id AS varchar(36)) FROM dbo.device_request_files f WHERE f.request_id = a.request_id AND f.stage = a.stage ORDER BY f.created_at DESC) AS proof_file_id
       FROM dbo.device_request_approvals a
       JOIN dbo.users ap ON ap.id = a.approver_id LEFT JOIN dbo.users db ON db.id = a.decided_by
      WHERE a.request_id=@id ORDER BY a.stage`,
    { id }
  );
  const staff = me.role === "admin" || me.role === "agent";
  if (!staff && r.requested_by !== me.id && !approvals.some((a: any) => a.approver_id === me.id)) throw new HttpError(404, "Not found");
  const items = await query<any>(
    `SELECT i.id, i.sr_no, i.employee_name, i.unit, i.department, i.designation, i.mobile_type, i.sim_required,
            i.laptop_pc, i.accessories, i.purpose, i.asset_tag, CONVERT(varchar(10), i.issued_on, 23) AS issued_on, iu.full_name AS issued_by_name
       FROM dbo.device_request_items i LEFT JOIN dbo.users iu ON iu.id = i.issued_by
      WHERE i.request_id=@id ORDER BY i.sr_no`,
    { id }
  );
  const events = await query<any>(
    `SELECT e.id, e.action, e.detail, u.full_name AS actor_name, e.created_at
       FROM dbo.device_request_events e LEFT JOIN dbo.users u ON u.id = e.actor_id WHERE e.request_id=@id ORDER BY e.created_at`,
    { id }
  );
  return { ...r, items, approvals, events };
}

export async function logDeviceEvent(requestId: string, actorId: string | null, action: string, detail?: string) {
  await query(
    "INSERT INTO dbo.device_request_events (request_id, actor_id, action, detail) VALUES (@r, @a, @act, @d)",
    { r: requestId, a: actorId, act: action, d: detail ? detail.slice(0, 500) : null }
  );
}

export async function getDeviceApprovers(): Promise<{ hr: string | null; mgmt: string | null }> {
  const rows = await query<{ k: string; v: string | null }>("SELECT k, v FROM dbo.settings WHERE k IN ('device_hr','device_mgmt')");
  const get = (k: string) => rows.find((r) => r.k === k)?.v || null;
  return { hr: get("device_hr"), mgmt: get("device_mgmt") };
}

/** Save an approval-proof image under <uploads>/device/<request id>/ and record it against the stage. */
export async function storeProof(requestId: string, stage: number, userId: string, f: PreparedFile) {
  const dir = path.join(uploadDir(), "device", requestId);
  await fs.mkdir(dir, { recursive: true });
  const stored = `${crypto.randomUUID()}.${f.ext}`;
  await fs.writeFile(path.join(/*turbopackIgnore: true*/ dir, stored), f.buf, { flag: "wx" });
  await query(
    `INSERT INTO dbo.device_request_files (request_id, stage, stored_name, file_name, mime, size_bytes, uploaded_by)
     VALUES (@r, @s, @n, @f, @m, @z, @u)`,
    { r: requestId, s: stage, n: stored, f: f.name, m: f.mime, z: f.buf.length, u: userId }
  );
}
