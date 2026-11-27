"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell, { useProfile } from "@/components/AppShell";
import { api } from "@/lib/api";
import { fmtDay } from "@/lib/constants";
import type { Task } from "@/lib/tasks";

type C = { open_n: number; overdue: number; due_today: number; no_target: number; not_mine: number; done_n: number };
type Ov = { mine: C; given: C; team: Omit<C, "no_target"> | null; members: (C & { id: string; name: string })[] };

function Tile({ label, value, note, href, bad }: { label: string; value: number; note: string; href: string; bad?: boolean }) {
  return (
    <Link href={href} className="kpi" style={{ textDecoration: "none", color: "inherit" }}>
      <span className="kl">{label}</span>
      <span className="kv" style={bad && value > 0 ? { color: "var(--bad)" } : undefined}>{value}</span>
      <span className="kd">{note}</span>
    </Link>
  );
}

function Overview() {
  const me = useProfile()!;
  const [o, setO] = useState<Ov | null>(null);
  const [person, setPerson] = useState("");
  const [theirs, setTheirs] = useState<Task[]>([]);

  useEffect(() => {
    let live = true;
    const load = () => api<Ov>("/api/tasks/overview").then((x) => live && setO(x)).catch(() => {});
    load();
    const t = setInterval(load, 120000);
    return () => { live = false; clearInterval(t); };
  }, []);
  useEffect(() => {
    if (!person) return setTheirs([]);
    api<{ items: Task[] }>(`/api/tasks?view=team&person=${person}`).then((d) => setTheirs(d.items.filter((t) => t.status === "Open" || t.status === "In Progress" || t.status === "Not mine"))).catch(() => setTheirs([]));
  }, [person]);

  if (!o) return <p className="sub">Loading…</p>;
  const member = o.members.find((m) => m.id === person);

  return (
    <>
      <div className="ph">
        <div>
          <h1>Hello, {me.full_name?.split(" ")[0] || "there"}</h1>
          <p className="sub">Your tasks{o.team ? " and your team's" : ""} at a glance. Click a number to see the tasks.</p>
        </div>
        <Link href="/tasks" className="btn pri">Open all tasks</Link>
      </div>

      <div className="sec-h" style={{ margin: "4px 2px 10px" }}>Assigned to me</div>
      <div className="kpis">
        <Tile label="Open" value={o.mine.open_n} note="to do or in progress" href="/tasks?view=mine&status=active" />
        <Tile label="Overdue" value={o.mine.overdue} note="past target date" href="/tasks?view=mine&status=overdue" bad />
        <Tile label="Due today" value={o.mine.due_today} note={o.mine.no_target ? `${o.mine.no_target} without a date` : "on track"} href="/tasks?view=mine&status=today" />
        <Tile label="Done" value={o.mine.done_n} note="completed" href="/tasks?view=mine&status=Done" />
      </div>

      <div className="sec-h" style={{ margin: "18px 2px 10px" }}>Given by me</div>
      <div className="kpis">
        <Tile label="Open" value={o.given.open_n} note="waiting on others" href="/tasks?view=given&status=active" />
        <Tile label="Overdue" value={o.given.overdue} note="past target date" href="/tasks?view=given&status=overdue" bad />
        <Tile label="Not mine" value={o.given.not_mine} note="people flagged these" href="/tasks?view=given&status=Not%20mine" bad />
        <Tile label="Done" value={o.given.done_n} note="completed" href="/tasks?view=given&status=Done" />
      </div>

      {o.team && (
        <>
          <div className="sec-h" style={{ margin: "18px 2px 10px" }}>My team</div>
          <div className="kpis">
            <Tile label="Team open" value={o.team.open_n} note="to do or in progress" href="/tasks?view=team&status=active" />
            <Tile label="Overdue" value={o.team.overdue} note="past target date" href="/tasks?view=team&status=overdue" bad />
            <Tile label="Not mine" value={o.team.not_mine} note="flagged by the team" href="/tasks?view=team&status=Not%20mine" bad />
            <Tile label="Done" value={o.team.done_n} note="completed" href="/tasks?view=team&status=Done" />
          </div>

          <div className="card tw" style={{ marginBottom: 14 }}>
            <div style={{ padding: "12px 16px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <b>Team member</b>
              <select className="in sel" aria-label="Team member" value={person} onChange={(e) => setPerson(e.target.value)}>
                <option value="">Choose a person…</option>
                {o.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              {member && <span className="meta">{member.open_n} open · {member.overdue} overdue · {member.not_mine} not mine · {member.done_n} done</span>}
            </div>
            {person ? (
              theirs.length === 0 ? <p className="meta" style={{ padding: "0 16px 14px" }}>Nothing open.</p> : (
                <table className="tbl stack">
                  <thead><tr><th>#</th><th>Task</th><th>Target</th><th>Status</th><th>Remark</th></tr></thead>
                  <tbody>
                    {theirs.map((t) => (
                      <tr key={t.id}>
                        <td className="mono meta" data-l="#">{t.task_no}</td>
                        <td className="first" style={{ whiteSpace: "pre-wrap" }}>{t.task}</td>
                        <td data-l="Target">{t.target_on ? fmtDay(t.target_on) : "—"}</td>
                        <td data-l="Status">{t.status}</td>
                        <td data-l="Remark">{t.remark || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : (
              <table className="tbl stack">
                <thead><tr><th>Person</th><th>Open</th><th>Overdue</th><th>Not mine</th><th>Done</th></tr></thead>
                <tbody>
                  {o.members.map((m) => (
                    <tr key={m.id} style={{ cursor: "pointer" }} onClick={() => setPerson(m.id)}>
                      <td className="first"><b>{m.name}</b></td>
                      <td data-l="Open">{m.open_n}</td>
                      <td data-l="Overdue" style={m.overdue ? { color: "var(--bad)", fontWeight: 600 } : undefined}>{m.overdue}</td>
                      <td data-l="Not mine">{m.not_mine}</td>
                      <td data-l="Done">{m.done_n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </>
  );
}

export default function Home() {
  return (
    <AppShell>
      <Overview />
    </AppShell>
  );
}
