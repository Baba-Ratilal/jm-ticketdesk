// Sends email from a Microsoft 365 / Outlook mailbox using Microsoft Graph
// (app-only, client-credentials). No mailbox password and no SMTP AUTH needed.

let cached: { token: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET } = process.env;
  if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET) throw new Error("Microsoft Graph env vars missing");

  const res = await fetch(`https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Graph token error: ${json.error_description || res.status}`);
  cached = { token: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return cached.token;
}

export function emailConfigured() {
  return !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.MS_SENDER);
}

export async function sendMail(to: string | string[], subject: string, html: string) {
  if (!emailConfigured()) return { skipped: true };
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!recipients.length) return { skipped: true };

  const token = await getToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(process.env.MS_SENDER!)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
      },
      saveToSentItems: false,
    }),
  });
  if (!res.ok) throw new Error(`Graph sendMail failed (${res.status}): ${await res.text()}`);
  return { sent: true };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Simple, clean HTML email layout. */
export function emailTemplate(opts: { heading: string; lines: string[]; ticketUrl: string; ticketNo: number; title: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f6f7fb;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0">
      <tr><td style="padding:20px 24px;border-bottom:1px solid #eef2f6">
        <span style="display:inline-block;background:#4f46e5;color:#fff;font-weight:700;border-radius:8px;padding:6px 9px;font-size:13px">JM</span>
        <span style="font-weight:600;margin-left:8px">TicketDesk</span>
      </td></tr>
      <tr><td style="padding:24px">
        <h2 style="margin:0 0 6px;font-size:18px">${esc(opts.heading)}</h2>
        <p style="margin:0 0 16px;color:#64748b;font-size:14px">#${opts.ticketNo} · ${esc(opts.title)}</p>
        ${opts.lines.map((l) => `<p style="margin:0 0 10px;font-size:14px;line-height:1.55;color:#334155">${l}</p>`).join("")}
        <a href="${opts.ticketUrl}" style="display:inline-block;margin-top:12px;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:10px">Open ticket</a>
      </td></tr>
      <tr><td style="padding:14px 24px;border-top:1px solid #eef2f6;color:#94a3b8;font-size:12px">JM Aluminium · IT &amp; ERP support</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export { esc };
