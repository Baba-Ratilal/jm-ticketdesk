"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { PriorityBadge, StatusBadge, TypeBadge } from "@/components/Badges";
import Icon from "@/components/Icon";
import Kanban from "@/components/Kanban";
import { api } from "@/lib/api";
import { fmtDate, fmtDay, PRIORITIES, STATUSES, type Issue } from "@/lib/constants";

type Staff = { id: string; full_name: string | null; login_id: string | null };
const DONE_DAYS = 30;

function Issues() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("active");
  const [fType, setFType] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fAssignee, setFAssignee] = useState("");

  async function load() {
    try {
      const d = await api<{ issues: Issue[]; staff: Staff[] }>("/api/issues");
      setIssues(d.issues);
      setStaff(d.staff);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    try {
      const v = localStorage.getItem("issuesView");
      if (v === "list" || v === "board") setView(v);
    } catch {}
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  const pick = (v: "board" | "list") => {
    setView(v);
    try {
      localStorage.setItem("issuesView", v);
    } catch {}
  };

  const cutoff = Date.now() - DONE_DAYS * 86400000;
  const shown = issues.filter((i) => {
    const done = i.status === "Resolved" || i.status === "Closed";
    if (view === "board") {
      if (done && new Date(i.updated_at).getTime() < cutoff) return false; // keep the board short
    } else {
      if (fStatus === "active" && done) return false;
      if (fStatus && fStatus !== "active" && fStatus !== "all" && i.status !== fStatus) return false;
    }
    if (fType && i.type !== fType) return false;
    if (fPriority && i.priority !== fPriority) return false;
    if (fAssignee === "none" && i.assigned_to) return false;
    if (fAssignee && fAssignee !== "none" && i.assigned_to !== fAssignee) return false;
    if (q && !`${i.issue_no} ${i.title} ${i.erp_module ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  async function move(i: Issue, status: string) {
    await api(`/api/issues/${i.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await load();
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>Issues</h1>
          <p className="sub">Internal tracking for the IT team and admins — a problem, a bug or a project, with the tickets behind it.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="segs" role="group" aria-label="View">
            <button className={`seg ${view === "board" ? "on" : ""}`} onClick={() => pick("board")}>Board</button>
            <button className={`seg ${view === "list" ? "on" : ""}`} onClick={() => pick("list")}>List</button>
          </div>
          <Link href="/issues/new" className="btn pri">+ New issue</Link>
        </div>
      </div>

      <div className="tools">
        <div className="search">
          <Icon name="search" size={16} />
          <input className="in" placeholder="Search #, title, module…" aria-label="Search issues" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {view === "list" && (
          <select className="in sel" aria-label="Status" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="active">Active (not closed)</option>
            <option value="all">All statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        )}
        <select className="in sel" aria-label="Type" value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="">IT + ERP</option>
          <option>IT</option>
          <option>ERP</option>
        </select>
        <select className="in sel" aria-label="Priority" value={fPriority} onChange={(e) => setFPriority(e.target.value)}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select className="in sel" aria-label="Owner" value={fAssignee} onChange={(e) => setFAssignee(e.target.value)}>
          <option value="">Any owner</option>
          <option value="none">No owner</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.login_id}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="sub">Loading…</p>
      ) : view === "board" ? (
        <>
          <Kanban
            items={shown}
            onMove={move}
            renderCard={(i) => (
              <>
                <Link href={`/issues/${i.id}`} className="kt">#{i.issue_no} · {i.title}</Link>
                <div className="km">
                  <TypeBadge type={i.type} />
                  <PriorityBadge priority={i.priority} label={false} />
                  {i.ticket_count ? <span>{i.ticket_count} ticket{i.ticket_count > 1 ? "s" : ""}</span> : null}
                </div>
                <div className="km">{i.assignee_name || "No owner"}</div>
              </>
            )}
          />
          <p className="fine" style={{ marginTop: 6 }}>Drag a card to another column to change its status. Resolved and Closed columns show the last {DONE_DAYS} days.</p>
        </>
      ) : shown.length === 0 ? (
        <div className="card empty"><b>No issues match</b><p>Try clearing a filter, or add a new issue.</p></div>
      ) : (
        <div className="card tw">
          <table className="tbl stack">
            <thead>
              <tr><th>#</th><th>Issue</th><th>Priority</th><th>Status</th><th>Owner</th><th>Tickets</th></tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id}>
                  <td className="mono meta" data-l="#">{i.issue_no}</td>
                  <td className="first" style={{ maxWidth: 380 }}>
                    <Link href={`/issues/${i.id}`} className="nm" style={{ color: "var(--fg)" }}>{i.title}</Link>
                    <div className="meta" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 3, flexWrap: "wrap" }}>
                      <TypeBadge type={i.type} />
                      {i.erp_module && <span>{i.erp_module} · </span>}
                      {i.raised_on ? fmtDay(i.raised_on) : fmtDate(i.created_at)}{i.closed_on ? ` → closed ${fmtDay(i.closed_on)}` : ""}
                    </div>
                  </td>
                  <td data-l="Priority"><PriorityBadge priority={i.priority} /></td>
                  <td data-l="Status"><StatusBadge status={i.status} /></td>
                  <td data-l="Owner">{i.assignee_name || "—"}</td>
                  <td data-l="Tickets">{i.ticket_count || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function IssuesPage() {
  return (
    <AppShell staffOnly>
      <Issues />
    </AppShell>
  );
}
