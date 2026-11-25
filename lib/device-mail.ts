import { query } from "./db";
import { emailConfigured, esc, sendMail } from "./email";
import { getDeviceRequest, logDeviceEvent } from "./device-server";
import { STAGES } from "./device";
import type { DeviceRequest } from "./device";

const SYSTEM = { id: "", role: "admin" };
const base = () => (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");

function layout(heading: string, intro: string, r: DeviceRequest, button: string | null) {
  const rows = r.items
    .map((i) => {
      const dev = [i.mobile_type !== "N/A" ? `Mobile: ${i.mobile_type}` : "", i.sim_required === "Yes" ? "SIM" : "", i.laptop_pc ? `Laptop/PC: ${i.laptop_pc}` : "", i.accessories ? `Other: ${i.accessories}` : ""]
        .filter(Boolean).join("; ");
      const td = "padding:6px 8px;border-bottom:1px solid #eef2f6;font-size:13px;vertical-align:top";
      return `<tr><td style="${td}">${i.sr_no}</td><td style="${td}"><b>${esc(i.employee_name)}</b><br><span style="color:#64748b">${esc([i.unit, i.department, i.designation].filter(Boolean).join(" · "))}</span></td><td style="${td}">${esc(dev)}</td><td style="${td}">${esc(i.purpose)}</td></tr>`;
    })
    .join("");
  const th = "text-align:left;padding:6px 8px;border-bottom:2px solid #e2e8f0;font-size:12px;color:#64748b";
  return `<!doctype html><html><body style="margin:0;background:#f6f7fb;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
  <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border-radius:16px;border:1px solid #e2e8f0">
   <tr><td style="padding:20px 24px;border-bottom:1px solid #eef2f6"><span style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;border-radius:8px;padding:6px 9px;font-size:13px">JM</span> <span style="font-weight:600;margin-left:8px">TicketDesk · Device requirement IT/MOB/01</span></td></tr>
   <tr><td style="padding:24px">
    <h2 style="margin:0 0 6px;font-size:18px">${esc(heading)}</h2>
    <p style="margin:0 0 14px;color:#64748b;font-size:14px">Request #${r.req_no} · requested by ${esc(r.requester_name || "")} · needed by ${esc(r.requirement_on)}</p>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:#334155">${intro}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><th style="${th}">#</th><th style="${th}">Employee</th><th style="${th}">Devices</th><th style="${th}">Purpose</th></tr>${rows}</table>
    ${button ? `<a href="${button}" style="display:inline-block;margin-top:18px;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:10px">Review &amp; decide</a><p style="margin:10px 0 0;font-size:12px;color:#94a3b8">Sign in with your TicketDesk user ID to approve or reject.</p>` : ""}
   </td></tr>
   <tr><td style="padding:14px 24px;border-top:1px solid #eef2f6;color:#94a3b8;font-size:12px">JM Aluminium · IT &amp; ERP support</td></tr>
  </table></td></tr></table></body></html>`;
}

async function emailOf(userId: string | null) {
  if (!userId) return null;
  const [u] = await query<{ email: string | null }>("SELECT email FROM dbo.users WHERE id=@id AND active=1", { id: userId });
  return u?.email || null;
}

/** Mail the approver whose turn it now is (Dept Head → HR → Management). Never throws. */
export async function mailNextApprover(requestId: string) {
  try {
    const r = await getDeviceRequest(requestId, SYSTEM);
    if (!r.status.startsWith("Pending")) return;
    const cur = r.approvals.find((a) => !a.decision);
    if (!cur) return;
    const label = STAGES.find((s) => s.stage === cur.stage)!.label;
    if (!emailConfigured()) return void (await logDeviceEvent(requestId, null, "mail skipped", `Email is not configured on the server — tell ${cur.approver_name || label} to open the request`));
    const to = await emailOf(cur.approver_id);
    if (!to) return void (await logDeviceEvent(requestId, null, "mail skipped", `${label} approver ${cur.approver_name || ""} has no email address (admin: add it on the Users page)`));
    const prev = r.approvals.filter((a) => a.decision === "Approved").map((a) => STAGES.find((s) => s.stage === a.stage)!.label);
    const intro = `Your approval as <b>${esc(label)}</b> is needed for the device request below.${prev.length ? ` Already approved by: ${esc(prev.join(", "))}.` : ""}`;
    await sendMail(to, `Approval needed: device request #${r.req_no} (${r.requester_name || ""})`, layout("Device request waiting for your approval", intro, r, `${base()}/device-requests/${r.id}`));
    await logDeviceEvent(requestId, null, "mail sent", `Approval mail sent to ${label} (${cur.approver_name || to})`);
  } catch (e) {
    console.error("device approval mail failed:", e);
  }
}

/** Tell the requester (and, when approved, the IT team) how it ended. Never throws. */
export async function mailOutcome(requestId: string) {
  try {
    if (!emailConfigured()) return;
    const r = await getDeviceRequest(requestId, SYSTEM);
    const rej = r.approvals.find((a) => a.decision === "Rejected");
    const to = await emailOf(r.requested_by);
    if (r.status === "Rejected") {
      const label = STAGES.find((s) => s.stage === rej?.stage)?.label || "";
      if (to) await sendMail(to, `Device request #${r.req_no} rejected`, layout("Your device request was rejected", `Rejected by <b>${esc(rej?.approver_name || label)}</b> (${esc(label)})${rej?.remark ? `: ${esc(rej.remark)}` : "."}`, r, `${base()}/device-requests/${r.id}`));
    } else if (r.status === "Approved") {
      if (to) await sendMail(to, `Device request #${r.req_no} approved`, layout("Your device request is fully approved", "Department Head, HR and Management have approved. The IT team will issue the devices.", r, `${base()}/device-requests/${r.id}`));
      const it = await query<{ email: string }>("SELECT email FROM dbo.users WHERE role IN ('admin','agent') AND active=1 AND email IS NOT NULL");
      if (it.length) await sendMail(it.map((x) => x.email), `Approved: issue devices for request #${r.req_no}`, layout("Approved — devices can be issued", "All three approvals are done. Record the asset tag and issue date on the request.", r, `${base()}/device-requests/${r.id}`));
    }
  } catch (e) {
    console.error("device outcome mail failed:", e);
  }
}
