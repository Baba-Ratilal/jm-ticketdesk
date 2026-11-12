import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { handle } from "@/lib/http";
import { requireStaff } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dates are judged in India time (UTC+5:30): a ticket resolved at 11 PM on its target day is still on time.
const IST = "DATEADD(minute, 330, t.resolved_at)";
const SOLVED = `t.resolved_at IS NOT NULL AND t.status IN ('Resolved','Closed')`;
const ACTIVE = `t.status NOT IN ('Resolved','Closed')`;
// on time = solved by the target time when one is set, otherwise by the end of the target day
const ON_TIME = `t.target_date IS NOT NULL AND (
  (t.target_time IS NULL AND CAST(${IST} AS date) <= t.target_date) OR
  (t.target_time IS NOT NULL AND ${IST} <= DATEADD(second, DATEDIFF(second, CAST('00:00:00' AS time), t.target_time), CAST(t.target_date AS datetime2))))`;
// overdue = past the target day, or past the target time today
const LATE = `(t.target_date < CAST(@today AS date) OR (t.target_date = CAST(@today AS date) AND t.target_time IS NOT NULL AND t.target_time < CAST(@nowt AS time)))`;

const istToday = () => new Date(Date.now() + 330 * 60000);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireStaff(req);
    const period = req.nextUrl.searchParams.get("period") || "month";
    const now = istToday();
    const today = iso(now);
    const nowt = now.toISOString().slice(11, 19); // HH:MM:SS, India time
    const y = now.getUTCFullYear(), m = now.getUTCMonth();
    let from = "2000-01-01";
    if (period === "month") from = iso(new Date(Date.UTC(y, m, 1)));
    else if (period === "30d") from = iso(new Date(now.getTime() - 29 * 86400000));
    else if (period === "quarter") from = iso(new Date(Date.UTC(y, Math.floor(m / 3) * 3, 1)));
    else if (period === "year") from = iso(new Date(Date.UTC(y, 0, 1)));

    const [pending] = await query<any>(
      `SELECT COUNT(*) AS total,
              ISNULL(SUM(CASE WHEN ${LATE} THEN 1 ELSE 0 END),0) AS overdue,
              ISNULL(SUM(CASE WHEN t.target_date = CAST(@today AS date) AND NOT ${LATE} THEN 1 ELSE 0 END),0) AS due_today,
              ISNULL(SUM(CASE WHEN t.target_date IS NULL THEN 1 ELSE 0 END),0) AS no_target,
              ISNULL(SUM(CASE WHEN t.assigned_to IS NULL THEN 1 ELSE 0 END),0) AS unassigned,
              ISNULL(SUM(CASE WHEN t.type='IT' THEN 1 ELSE 0 END),0) AS it,
              ISNULL(SUM(CASE WHEN t.type='ERP' THEN 1 ELSE 0 END),0) AS erp
         FROM dbo.tickets t WHERE ${ACTIVE}`,
      { today, nowt }
    );

    const [solved] = await query<any>(
      `SELECT COUNT(*) AS solved,
              ISNULL(SUM(CASE WHEN t.target_date IS NOT NULL THEN 1 ELSE 0 END),0) AS with_target,
              ISNULL(SUM(CASE WHEN ${ON_TIME} THEN 1 ELSE 0 END),0) AS on_time,
              AVG(CAST(DATEDIFF(minute, t.created_at, t.resolved_at) AS float)) / 1440.0 AS avg_days
         FROM dbo.tickets t
        WHERE ${SOLVED} AND CAST(${IST} AS date) >= CAST(@from AS date)`,
      { from }
    );

    const people = await query<any>(
      `SELECT u.id, u.full_name, u.login_id,
              (SELECT COUNT(*) FROM dbo.tickets t WHERE t.assigned_to=u.id AND ${ACTIVE}) AS pending,
              (SELECT COUNT(*) FROM dbo.tickets t WHERE t.assigned_to=u.id AND ${ACTIVE} AND ${LATE}) AS overdue,
              (SELECT COUNT(*) FROM dbo.tickets t WHERE t.assigned_to=u.id AND ${SOLVED} AND CAST(${IST} AS date) >= CAST(@from AS date)) AS solved,
              (SELECT COUNT(*) FROM dbo.tickets t WHERE t.assigned_to=u.id AND ${SOLVED} AND CAST(${IST} AS date) >= CAST(@from AS date) AND t.target_date IS NOT NULL) AS with_target,
              (SELECT COUNT(*) FROM dbo.tickets t WHERE t.assigned_to=u.id AND ${SOLVED} AND CAST(${IST} AS date) >= CAST(@from AS date) AND ${ON_TIME}) AS on_time
         FROM dbo.users u WHERE u.role IN ('admin','agent') AND u.active=1 ORDER BY u.full_name`,
      { today, nowt, from }
    );

    // last 6 months, always (independent of the period switch)
    const trendFrom = iso(new Date(Date.UTC(y, m - 5, 1)));
    const rows = await query<any>(
      `SELECT YEAR(${IST}) AS y, MONTH(${IST}) AS m, COUNT(*) AS solved,
              SUM(CASE WHEN t.target_date IS NOT NULL THEN 1 ELSE 0 END) AS with_target,
              SUM(CASE WHEN ${ON_TIME} THEN 1 ELSE 0 END) AS on_time
         FROM dbo.tickets t
        WHERE ${SOLVED} AND CAST(${IST} AS date) >= CAST(@tf AS date)
        GROUP BY YEAR(${IST}), MONTH(${IST})`,
      { tf: trendFrom }
    );
    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - i, 1));
      const r = rows.find((x: any) => Number(x.y) === d.getUTCFullYear() && Number(x.m) === d.getUTCMonth() + 1);
      trend.push({
        label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" }),
        solved: Number(r?.solved ?? 0),
        with_target: Number(r?.with_target ?? 0),
        on_time_pct: pct(Number(r?.on_time ?? 0), Number(r?.with_target ?? 0)),
      });
    }

    const n = (v: any) => Number(v ?? 0);

    // Issues and MOM points: each is skipped (null) if its table has not been created yet, so the overview never breaks.
    const IIST = "DATEADD(minute, 330, i.resolved_at)";
    let issues: any = null;
    try {
      const [a] = await query<any>(
        `SELECT COUNT(*) AS total,
                ISNULL(SUM(CASE WHEN i.type='IT' THEN 1 ELSE 0 END),0) AS it,
                ISNULL(SUM(CASE WHEN i.type='ERP' THEN 1 ELSE 0 END),0) AS erp,
                ISNULL(SUM(CASE WHEN i.assigned_to IS NULL THEN 1 ELSE 0 END),0) AS unassigned,
                ISNULL(SUM(CASE WHEN i.priority IN ('High','Critical') THEN 1 ELSE 0 END),0) AS urgent
           FROM dbo.issues i WHERE i.status NOT IN ('Resolved','Closed')`
      );
      const [b] = await query<any>(
        `SELECT COUNT(*) AS solved FROM dbo.issues i
          WHERE i.resolved_at IS NOT NULL AND i.status IN ('Resolved','Closed') AND CAST(${IIST} AS date) >= CAST(@from AS date)`,
        { from }
      );
      issues = { pending: n(a.total), it: n(a.it), erp: n(a.erp), unassigned: n(a.unassigned), urgent: n(a.urgent), solved: n(b.solved) };
    } catch {}
    let mom: any = null;
    try {
      const [m1] = await query<any>(
        `SELECT COUNT(*) AS total,
                ISNULL(SUM(CASE WHEN status <> 'Done' THEN 1 ELSE 0 END),0) AS pending,
                ISNULL(SUM(CASE WHEN status <> 'Done' AND target_date < CAST(@today AS date) THEN 1 ELSE 0 END),0) AS overdue,
                ISNULL(SUM(CASE WHEN status <> 'Done' AND target_date = CAST(@today AS date) THEN 1 ELSE 0 END),0) AS due_today,
                ISNULL(SUM(CASE WHEN status <> 'Done' AND assigned_to IS NULL THEN 1 ELSE 0 END),0) AS unassigned,
                ISNULL(SUM(CASE WHEN status = 'Done' THEN 1 ELSE 0 END),0) AS done
           FROM dbo.mom_points`,
        { today }
      );
      mom = { total: n(m1.total), pending: n(m1.pending), overdue: n(m1.overdue), due_today: n(m1.due_today), unassigned: n(m1.unassigned), done: n(m1.done), done_pct: pct(n(m1.done), n(m1.total)) };
    } catch {}
    // per-person pending issues / MOM points
    const extra = new Map<string, { issues: number; mom: number; mom_overdue: number }>();
    for (const p of people) extra.set(p.id, { issues: 0, mom: 0, mom_overdue: 0 });
    try {
      for (const r of await query<any>(`SELECT assigned_to AS id, COUNT(*) AS c FROM dbo.issues WHERE assigned_to IS NOT NULL AND status NOT IN ('Resolved','Closed') GROUP BY assigned_to`))
        if (extra.has(r.id)) extra.get(r.id)!.issues = n(r.c);
    } catch {}
    try {
      for (const r of await query<any>(
        `SELECT assigned_to AS id, COUNT(*) AS c, SUM(CASE WHEN target_date < CAST(@today AS date) THEN 1 ELSE 0 END) AS od
           FROM dbo.mom_points WHERE assigned_to IS NOT NULL AND status <> 'Done' GROUP BY assigned_to`, { today }))
        if (extra.has(r.id)) Object.assign(extra.get(r.id)!, { mom: n(r.c), mom_overdue: n(r.od) });
    } catch {}

    return {
      issues,
      mom,
      period,
      from,
      pending: { total: n(pending.total), overdue: n(pending.overdue), due_today: n(pending.due_today), no_target: n(pending.no_target), unassigned: n(pending.unassigned), it: n(pending.it), erp: n(pending.erp) },
      solved: {
        count: n(solved.solved),
        with_target: n(solved.with_target),
        on_time: n(solved.on_time),
        on_time_pct: pct(n(solved.on_time), n(solved.with_target)),
        avg_days: solved.avg_days == null ? null : Math.round(Number(solved.avg_days) * 10) / 10,
      },
      people: people.map((p: any) => ({
        id: p.id, name: p.full_name || p.login_id,
        pending: n(p.pending), overdue: n(p.overdue), solved: n(p.solved),
        on_time_pct: pct(n(p.on_time), n(p.with_target)), with_target: n(p.with_target),
        issues: extra.get(p.id)?.issues ?? 0, mom: extra.get(p.id)?.mom ?? 0, mom_overdue: extra.get(p.id)?.mom_overdue ?? 0,
      })),
      trend,
    };
  });
}
