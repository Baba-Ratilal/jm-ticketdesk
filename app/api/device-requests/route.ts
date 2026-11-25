import type { NextRequest } from "next/server";
import { isGuid, query } from "@/lib/db";
import { MAX_ITEMS, MOBILE_TYPES, SIM_OPTIONS } from "@/lib/device";
import { getDeviceApprovers, logDeviceEvent } from "@/lib/device-server";
import { mailNextApprover } from "@/lib/device-mail";
import { handle, HttpError } from "@/lib/http";
import { requireUser } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

export async function GET(req: NextRequest) {
  return handle(async () => {
    const me = await requireUser(req);
    const staff = me.role === "admin" || me.role === "agent";
    const items = await query(
      `SELECT d.id, d.req_no, CONVERT(varchar(10), d.requirement_date, 23) AS requirement_on, d.status,
              u.full_name AS requester_name,
              (SELECT COUNT(*) FROM dbo.device_request_items i WHERE i.request_id = d.id) AS items_count,
              (SELECT STRING_AGG(CAST(i.employee_name AS nvarchar(max)), ', ') WITHIN GROUP (ORDER BY i.sr_no) FROM dbo.device_request_items i WHERE i.request_id = d.id) AS names,
              cur.approver_id AS cur_approver_id, cur.approver_name AS cur_approver_name, cur.stage AS cur_stage
         FROM dbo.device_requests d
         JOIN dbo.users u ON u.id = d.requested_by
         OUTER APPLY (SELECT TOP 1 a.stage, a.approver_id, ap.full_name AS approver_name
                        FROM dbo.device_request_approvals a JOIN dbo.users ap ON ap.id = a.approver_id
                       WHERE a.request_id = d.id AND a.decision IS NULL AND d.status LIKE 'Pending%' ORDER BY a.stage) cur
        WHERE @staff = 1 OR d.requested_by = @me
           OR EXISTS (SELECT 1 FROM dbo.device_request_approvals a WHERE a.request_id = d.id AND a.approver_id = @me)
        ORDER BY d.req_no DESC`,
      { staff: staff ? 1 : 0, me: me.id }
    );
    return { items };
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const me = await requireUser(req);
    const d = await req.json().catch(() => ({}));

    const reqOn = String(d.requirement_on ?? "");
    if (!DATE_RE.test(reqOn) || reqOn < "2020-01-01") throw new HttpError(400, "Choose the requirement date");
    const dh = String(d.dept_head_id ?? "");
    if (!isGuid(dh)) throw new HttpError(400, "Choose your Department Head");
    if (dh === me.id) throw new HttpError(400, "You cannot be your own Department Head approver");
    const [dhUser] = await query("SELECT id FROM dbo.users WHERE id=@id AND active=1", { id: dh });
    if (!dhUser) throw new HttpError(400, "Choose an active Department Head");
    const { hr, mgmt } = await getDeviceApprovers();
    if (!hr || !mgmt) throw new HttpError(400, "The HR and Management approvers have not been set yet. Ask an admin to set them on the Device requests page.");

    const rows: any[] = Array.isArray(d.items) ? d.items : [];
    if (rows.length < 1 || rows.length > MAX_ITEMS) throw new HttpError(400, `Add between 1 and ${MAX_ITEMS} employees`);

    const p: Record<string, unknown> = { me: me.id, reqOn, dh, hr, mgmt };
    let inserts = "";
    rows.forEach((r, i) => {
      const n = i + 1;
      const name = clean(r.employee_name, 150);
      const purpose = clean(r.purpose, 500);
      const mobile = MOBILE_TYPES.includes(r.mobile_type) ? r.mobile_type : "N/A";
      const sim = SIM_OPTIONS.includes(r.sim_required) ? r.sim_required : "N/A";
      const laptop = clean(r.laptop_pc, 300), acc = clean(r.accessories, 300);
      if (name.length < 2) throw new HttpError(400, `Row ${n}: enter the employee name`);
      if (purpose.length < 5) throw new HttpError(400, `Row ${n}: the purpose is required — say why ${name} needs the device (at least 5 characters)`);
      if (mobile === "N/A" && sim !== "Yes" && !laptop && !acc) throw new HttpError(400, `Row ${n}: choose at least one device (mobile, SIM, laptop / PC or accessories)`);
      Object.assign(p, {
        [`n${n}`]: name, [`u${n}`]: clean(r.unit, 100) || null, [`dp${n}`]: clean(r.department, 100) || null, [`ds${n}`]: clean(r.designation, 100) || null,
        [`m${n}`]: mobile, [`s${n}`]: sim, [`l${n}`]: laptop || null, [`a${n}`]: acc || null, [`pu${n}`]: purpose,
      });
      inserts += `INSERT INTO dbo.device_request_items (request_id, sr_no, employee_name, unit, department, designation, mobile_type, sim_required, laptop_pc, accessories, purpose)
                  VALUES (@id, ${n}, @n${n}, @u${n}, @dp${n}, @ds${n}, @m${n}, @s${n}, @l${n}, @a${n}, @pu${n});\n`;
    });

    const [row] = await query<{ id: string }>(
      `SET XACT_ABORT ON;
       BEGIN TRAN;
       DECLARE @id UNIQUEIDENTIFIER = NEWID();
       INSERT INTO dbo.device_requests (id, requirement_date, requested_by) VALUES (@id, @reqOn, @me);
       ${inserts}
       INSERT INTO dbo.device_request_approvals (request_id, stage, approver_id) VALUES (@id, 1, @dh), (@id, 2, @hr), (@id, 3, @mgmt);
       COMMIT;
       SELECT @id AS id;`,
      p
    );
    await logDeviceEvent(row.id, me.id, "submitted", `${rows.length} employee${rows.length === 1 ? "" : "s"}`);
    await mailNextApprover(row.id);
    return { id: row.id };
  });
}
