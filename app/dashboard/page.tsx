"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

type Dash = {
  period: string;
  pending: { total: number; overdue: number; due_today: number; no_target: number; unassigned: number; it: number; erp: number };
  solved: { count: number; with_target: number; on_time: number; on_time_pct: number | null; avg_days: number | null };
  people: { id: string; name: string; pending: number; overdue: number; solved: number; on_time_pct: number | null; with_target: number }[];
  trend: { label: string; solved: number; with_target: number; on_time_pct: number | null }[];
};

const PERIODS = [
  ["month", "This month"],
  ["30d", "Last 30 days"],
  ["quarter", "This quarter"],
  ["year", "This year"],
  ["all", "All time"],
] as const;

const pctText = (v: number | null) => (v == null ? "—" : `${v}%`);
const tone = (v: number | null) => (v == null ? "" : v >= 90 ? "ok" : v >= 70 ? "warn" : "bad");

function Dashboard() {
  const [period, setPeriod] = useState<string>("month");
  const [d, setD] = useState<Dash | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => api<Dash>(`/api/dashboard?period=${period}`).then((x) => live && setD(x)).catch(() => {});
    load();
    const t = setInterval(load, 120000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [period]);

  if (!d) return <p className="sub">Loading…</p>;
  const label = PERIODS.find((p) => p[0] === period)?.[1] ?? "";
  const maxSolved = Math.max(1, ...d.trend.map((t) => t.solved));

  return (
    <>
      <div className="ph">
        <div>
          <h1>Dashboard</h1>
          <p className="sub">Pending work, what has been solved, and how often we deliver by the target date.</p>
        </div>
        <select className="in sel" aria-label="Period" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      <div className="kpis">
        <div className="kpi static">
          <span className="kl">Pending</span>
          <span className="kv">{d.pending.total}</span>
          <span className="kd">{d.pending.it} IT · {d.pending.erp} ERP · {d.pending.unassigned} unassigned</span>
        </div>
        <div className="kpi static">
          <span className="kl">Overdue</span>
          <span className="kv" style={d.pending.overdue ? { color: "var(--bad)" } : undefined}>{d.pending.overdue}</span>
          <span className="kd">{d.pending.due_today} due today · {d.pending.no_target} without a target date</span>
        </div>
        <div className="kpi static">
          <span className="kl">Solved · {label.toLowerCase()}</span>
          <span className="kv">{d.solved.count}</span>
          <span className="kd">{d.solved.avg_days == null ? "no average yet" : `average ${d.solved.avg_days} days to solve`}</span>
        </div>
        <div className="kpi static">
          <span className="kl">On-time delivery</span>
          <span className="kv" style={{ color: d.solved.on_time_pct == null ? undefined : `var(--${tone(d.solved.on_time_pct)})` }}>
            {pctText(d.solved.on_time_pct)}
          </span>
          <span className="kd">
            {d.solved.on_time} of {d.solved.with_target} solved with a target date
          </span>
        </div>
      </div>

      {d.solved.count > d.solved.with_target && (
        <p className="fine" style={{ margin: "-4px 0 14px" }}>
          {d.solved.count - d.solved.with_target} solved ticket{d.solved.count - d.solved.with_target === 1 ? " had" : "s had"} no target date, so {d.solved.count - d.solved.with_target === 1 ? "it is" : "they are"} not counted in on-time %. On time means solved on or before the target date.
        </p>
      )}

      <div className="two" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <div className="card pad">
          <div className="sec-h">Last 6 months</div>
          <div className="trend">
            {d.trend.map((t) => (
              <div key={t.label} className="tcol" title={`${t.label}: ${t.solved} solved, ${pctText(t.on_time_pct)} on time`}>
                <span className="tpct">{pctText(t.on_time_pct)}</span>
                <div className="tbar"><i style={{ height: `${(t.solved / maxSolved) * 100}%` }} /></div>
                <b>{t.solved}</b>
                <span className="tl2">{t.label}</span>
              </div>
            ))}
          </div>
          <p className="fine" style={{ marginTop: 8 }}>Bars show tickets solved; the % above is on-time delivery for that month.</p>
        </div>

        <div className="card tw">
          <table className="tbl">
            <thead>
              <tr><th>Person</th><th>Pending</th><th>Overdue</th><th>Solved</th><th>On time</th></tr>
            </thead>
            <tbody>
              {d.people.map((p) => (
                <tr key={p.id}>
                  <td className="first"><div className="nm">{p.name}</div></td>
                  <td>{p.pending}</td>
                  <td style={p.overdue ? { color: "var(--bad)", fontWeight: 650 } : undefined}>{p.overdue}</td>
                  <td>{p.solved}</td>
                  <td>{pctText(p.on_time_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="sub" style={{ marginTop: 14 }}>
        Set the target date on each ticket (Manage panel). See <Link href="/admin" style={{ color: "var(--accent)" }}>the queue</Link> for tickets without one.
      </p>
    </>
  );
}

export default function DashboardPage() {
  return (
    <AppShell staffOnly>
      <Dashboard />
    </AppShell>
  );
}
