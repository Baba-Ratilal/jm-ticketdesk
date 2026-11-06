// Daily to-do email for the IT team and admins (run by the "TicketDesk digest" scheduled task at 9 AM, 2 PM, 4 PM).
//
//   node --env-file=.env.local scripts/send-digest.js            send for real
//   node --env-file=.env.local scripts/send-digest.js --dry      print what would be sent, send nothing
//   node --env-file=.env.local scripts/send-digest.js --to=me@company.com   send every digest to one address (test)
//   add --force to also send to people who have nothing assigned
//
// Each person gets their own assigned tickets and issues (most urgent first) and a count of unassigned tickets.
// Admins also get a short per-person summary of the whole team.

const { query, closePool } = require("../lib/dbcore");

const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force");
const TO = (process.argv.find((a) => a.startsWith("--to=")) || "").slice(5);
const log = (...a) => console.log(new Date().toISOString().replace("T", " ").slice(0, 19), ...a);

const LEVEL = { Low: 1, Medium: 2, High: 3, Critical: 4 };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const days = (d) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
const base = (process.env.NEXTAUTH_URL || "").replace(/\/$/, "");

const configured = () => !!(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.MS_SENDER);

let cached;
async function token() {
  if (cached && cached.exp > Date.now() + 60000) return cached.token;
  const res = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID,
      client_secret: process.env.MS_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`Graph token error: ${j.error_description || res.status}`);
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

async function send(to, subject, html) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(process.env.MS_SENDER)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: { subject, body: { contentType: "HTML", content: html }, toRecipients: [{ emailAddress: { address: to } }] },
      saveToSentItems: false,
    }),
  });
  if (!res.ok) throw new Error(`Graph sendMail failed (${res.status}): ${await res.text()}`);
}

const istNow = () => new Date(Date.now() + 330 * 60000).toISOString(); // India time as an ISO string
const isLate = (x) => {
  if (!x.target_on) return false;
  const now = istNow();
  const today = now.slice(0, 10);
  if (x.target_on !== today) return x.target_on < today;
  return !!x.target_at && x.target_at < now.slice(11, 16);
};
const late = (x) => (isLate(x) ? 1 : 0);
const byUrgency = (a, b) => late(b) - late(a) || (LEVEL[b.priority] || 0) - (LEVEL[a.priority] || 0) || new Date(a.created_at) - new Date(b.created_at);
const color = { Critical: "#c0372f", High: "#a15f00", Medium: "#46575d", Low: "#72848a" };

const fmtDay = (s) => new Date(s + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
const fmtClock = (t) => {
  const [h, m] = t.split(":").map(Number);
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).toUpperCase();
};
function dueText(i) {
  if (!i.target_on) return "";
  const lateNow = isLate(i);
  const col = lateNow ? "#c0372f" : i.target_on === istNow().slice(0, 10) ? "#a15f00" : "#72848a";
  const when = fmtDay(i.target_on) + (i.target_at ? ", " + fmtClock(i.target_at) : "");
  return ` · <span style="color:${col};font-weight:${lateNow ? 700 : 400}">${lateNow ? "OVERDUE, was due" : "due"} ${when}</span>`;
}

function row(i) {
  const url = `${base}/${i.kind === "Ticket" ? "tickets" : "issues"}/${i.id}`;
  return `<tr>
    <td style="padding:7px 10px;border-top:1px solid #e5eaec"><a href="${url}" style="color:#0b6e75;text-decoration:none;font-weight:600">${i.kind === "Ticket" ? "#" : "Issue #"}${i.no}</a>
      <span style="color:#121a1d"> ${esc(i.title)}</span><div style="color:#72848a;font-size:12px">${esc(i.type)} · ${esc(i.status)}${dueText(i)}</div></td>
    <td style="padding:7px 10px;border-top:1px solid #e5eaec;white-space:nowrap;color:${color[i.priority] || "#46575d"};font-weight:600">${esc(i.priority)}</td>
    <td style="padding:7px 10px;border-top:1px solid #e5eaec;white-space:nowrap;color:#46575d">${days(i.created_at)}d</td></tr>`;
}

const CAP = 25;
function listTable(items) {
  const shown = items.slice(0, CAP);
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5eaec;border-radius:8px;border-collapse:separate;font-size:14px">
    <tr style="background:#f4f7f8;color:#72848a;font-size:12px;text-align:left"><th style="padding:7px 10px">Item</th><th style="padding:7px 10px">Priority</th><th style="padding:7px 10px">Waiting</th></tr>
    ${shown.map(row).join("")}</table>${items.length > shown.length ? `<p style="color:#72848a;font-size:12px;margin:6px 0 0">+ ${items.length - shown.length} more — open the app to see all.</p>` : ""}`;
}
const h3 = (t) => `<h3 style="margin:24px 0 8px;font-size:14px">${t}</h3>`;

function html(person, mine, pool, others, team, label) {
  const unassigned = pool.length;
  const urgent = mine.filter((i) => (LEVEL[i.priority] || 0) >= 3).length;
  const table = mine.length ? listTable(mine) : `<p style="color:#46575d">Nothing is assigned to you right now.</p>`;
  const teamBlock = team
    ? `<h3 style="margin:22px 0 8px;font-size:14px">Team</h3>
       <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5eaec;font-size:13px;border-collapse:collapse">
         <tr style="background:#f4f7f8;color:#72848a;font-size:12px;text-align:left"><th style="padding:6px 10px">Person</th><th style="padding:6px 10px">Tickets</th><th style="padding:6px 10px">Issues</th><th style="padding:6px 10px">High / Critical</th></tr>
         ${team.map((m) => `<tr><td style="padding:6px 10px;border-top:1px solid #e5eaec">${esc(m.name)}</td><td style="padding:6px 10px;border-top:1px solid #e5eaec">${m.tickets}</td><td style="padding:6px 10px;border-top:1px solid #e5eaec">${m.issues}</td><td style="padding:6px 10px;border-top:1px solid #e5eaec">${m.urgent}</td></tr>`).join("")}
       </table>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#edf1f2;font-family:Segoe UI,Arial,sans-serif;color:#121a1d">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:22px 10px">
  <table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border:1px solid #dce3e5;border-radius:12px">
   <tr><td style="padding:20px 24px">
     <h2 style="margin:0 0 4px;font-size:18px">${label} to-do, ${esc(person.full_name || person.login_id)}</h2>
     <p style="margin:0 0 16px;color:#46575d;font-size:14px">${mine.length} item${mine.length === 1 ? "" : "s"} assigned to you${urgent ? `, <b style="color:#c0372f">${urgent} high or critical</b>` : ""}.
       ${unassigned ? ` ${unassigned} ticket${unassigned === 1 ? " is" : "s are"} still unassigned in the queue.` : ""}</p>
     ${table}
     ${pool.length ? h3(`Unassigned tickets (${pool.length}) — pick one up`) + listTable(pool) : ""}
     ${others && others.length ? h3("Everyone else's open items") + others.map((o) => `<p style="margin:12px 0 6px;font-size:13px;color:#46575d"><b>${esc(o.name)}</b> · ${o.items.length}</p>` + listTable(o.items)).join("") : ""}
     ${teamBlock}
     <p style="margin:20px 0 0"><a href="${base}/work" style="display:inline-block;background:#0b6e75;color:#fff;text-decoration:none;font-weight:600;padding:9px 16px;border-radius:9px">Open My work</a></p>
   </td></tr>
   <tr><td style="padding:12px 24px;border-top:1px solid #eef2f3;color:#72848a;font-size:12px">JM TicketDesk · sent automatically at 9 AM, 2 PM and 4 PM</td></tr>
  </table></td></tr></table></body></html>`;
}

async function main() {
  if (!DRY && !configured())
    throw new Error("Email is not set up: fill MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET and MS_SENDER in .env.local (or run with --dry).");

  const people = await query(
    "SELECT id, login_id, full_name, email, role FROM dbo.users WHERE role IN ('admin','agent') AND active=1"
  );
  const tickets = await query(
    "SELECT id, ticket_no AS no, type, title, priority, status, created_at, assigned_to, CONVERT(varchar(10), target_date, 23) AS target_on, CONVERT(varchar(5), target_time, 108) AS target_at FROM dbo.tickets WHERE status NOT IN ('Resolved','Closed')"
  );
  const issues = await query(
    "SELECT id, issue_no AS no, type, title, priority, status, created_at, assigned_to FROM dbo.issues WHERE status NOT IN ('Resolved','Closed')"
  );
  const all = [...tickets.map((t) => ({ ...t, kind: "Ticket" })), ...issues.map((i) => ({ ...i, kind: "Issue" }))];
  const pool = tickets.filter((t) => !t.assigned_to).map((t) => ({ ...t, kind: "Ticket" })).sort(byUrgency);
  const unassigned = pool.length;

  const team = people
    .map((p) => {
      const t = tickets.filter((x) => x.assigned_to === p.id);
      return {
        name: p.full_name || p.login_id,
        tickets: t.length,
        issues: issues.filter((x) => x.assigned_to === p.id).length,
        urgent: t.filter((x) => (LEVEL[x.priority] || 0) >= 3).length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const hour = new Date().getHours();
  const label = hour < 12 ? "Morning" : hour < 15 ? "Afternoon" : "Evening";

  let sent = 0, skipped = 0, noEmail = 0, failed = 0;
  for (const p of people) {
    const dest = TO || p.email;
    if (!dest) { noEmail++; log(`no email on file for ${p.login_id} — skipped`); continue; }
    const mine = all.filter((i) => i.assigned_to === p.id).sort(byUrgency);
    if (!mine.length && !unassigned && p.role !== "admin" && !FORCE) { skipped++; continue; }
    const subject = `${label} to-do: ${mine.length} item${mine.length === 1 ? "" : "s"}${unassigned ? `, ${unassigned} unassigned` : ""}`;
    const isAdmin = p.role === "admin";
    const others = isAdmin
      ? people
          .filter((x) => x.id !== p.id)
          .map((x) => ({ name: x.full_name || x.login_id, items: all.filter((i) => i.assigned_to === x.id).sort(byUrgency) }))
          .filter((o) => o.items.length)
      : null;
    const body = html(p, mine, pool, others, isAdmin ? team : null, label);
    if (DRY) { log(`[dry] would send to ${dest}: "${subject}" (${mine.length} assigned)`); sent++; continue; }
    try { await send(dest, subject, body); sent++; log(`sent to ${dest}: ${subject}`); }
    catch (e) { failed++; log(`FAILED for ${dest}: ${e.message}`); }
  }
  log(`done — sent ${sent}, skipped (nothing to do) ${skipped}, no email ${noEmail}, failed ${failed}`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => { log("ERROR:", e.message); process.exitCode = 1; })
  .finally(() => closePool());
