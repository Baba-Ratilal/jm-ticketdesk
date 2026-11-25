"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell, { useProfile } from "@/components/AppShell";
import { PriorityBadge, StatusBadge, TypeBadge } from "@/components/Badges";
import Icon from "@/components/Icon";
import BulkBar from "@/components/BulkBar";
import Kanban from "@/components/Kanban";
import { api } from "@/lib/api";
import { fmtDate, fmtDay, fmtDue, isOverdue, PRIORITIES, STATUSES, type Ticket } from "@/lib/constants";

type Admin = { id: string; email: string; full_name: string | null; phone?: string | null };

function Dashboard() {
  const me = useProfile()!;
  const isAdmin = me.role === "admin";
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("active");
  const [fType, setFType] = useState("");
  const [fPriority, setFPriority] = useState("");
  const [fAssignee, setFAssignee] = useState("");
  const [view, setView] = useState<"board" | "list">("list");

  async function load() {
    try {
      const d = await api<{ tickets: Ticket[]; admins: Admin[] }>("/api/tickets?scope=all");
      setTickets(d.tickets);
      setAdmins(d.admins);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    try {
      const v = localStorage.getItem("ticketsView");
      if (v === "list" || v === "board") setView(v);
    } catch {}
    load();
    const timer = setInterval(load, 60000); // auto-refresh every minute
    return () => clearInterval(timer);
  }, []);

  const pickView = (v: "board" | "list") => {
    setView(v);
    try {
      localStorage.setItem("ticketsView", v);
    } catch {}
  };
  const DONE_DAYS = 30;
  const isActive = (t: Ticket) => !["Resolved", "Closed"].includes(t.status);

  const shown = tickets.filter((t) => {
    if (view === "board") {
      // the board has a column per status; keep Resolved / Closed short
      if (!isActive(t) && new Date(t.updated_at).getTime() < Date.now() - DONE_DAYS * 86400000) return false;
    } else {
      if (fStatus === "active" && !isActive(t)) return false;
      if (fStatus && fStatus !== "active" && fStatus !== "all" && t.status !== fStatus) return false;
    }
    if (fType && t.type !== fType) return false;
    if (fPriority && t.priority !== fPriority) return false;
    if (fAssignee === "me" && t.assigned_to !== me.id) return false;
    if (fAssignee === "none" && t.assigned_to) return false;
    if (fAssignee && fAssignee !== "none" && fAssignee !== "me" && t.assigned_to !== fAssignee) return false;
    if (q) {
      const hay = `${t.ticket_no} ${t.title} ${t.creator_name} ${t.department} ${t.unit}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  async function assign(t: Ticket, uid: string) {
    try {
      await api(`/api/tickets/${t.id}`, { method: "PATCH", body: JSON.stringify({ assigned_to: uid || null }) });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function moveTicket(t: Ticket, status: string) {
    await api(`/api/tickets/${t.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    await load();
  }

  return (
    <>
      <div className="ph">
        <div>
          <h1>Tickets</h1>
          <p className="sub">
            {isAdmin
              ? "Assign, prioritise and resolve IT & ERP requests."
              : "Your assigned tickets and the unassigned ones you can pick up."}
          </p>
        </div>
        <div className="segs" role="group" aria-label="View">
          <button className={`seg ${view === "board" ? "on" : ""}`} onClick={() => pickView("board")}>Board</button>
          <button className={`seg ${view === "list" ? "on" : ""}`} onClick={() => pickView("list")}>List</button>
        </div>
      </div>

      <BulkBar kind="tickets" label="tickets" isAdmin={isAdmin} onImported={load} />

      <div className="tools">
        <div className="search">
          <Icon name="search" size={16} />
          <input
            className="in"
            placeholder="Search #, title, person, department…"
            aria-label="Search tickets"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {view === "list" && (
          <select className="in sel" aria-label="Status" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="active">Active (not closed)</option>
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        )}
        <select className="in sel" aria-label="Type" value={fType} onChange={(e) => setFType(e.target.value)}>
          <option value="">IT + ERP</option>
          <option>IT</option>
          <option>ERP</option>
        </select>
        <select className="in sel" aria-label="Priority" value={fPriority} onChange={(e) => setFPriority(e.target.value)}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select className="in sel" aria-label="Assignee" value={fAssignee} onChange={(e) => setFAssignee(e.target.value)}>
          <option value="">Anyone</option>
          {!isAdmin && <option value="me">Assigned to me</option>}
          <option value="none">Unassigned</option>
          {isAdmin &&
            admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name || a.email}
              </option>
            ))}
        </select>
      </div>

      {loading ? (
        <p className="sub">Loading…</p>
      ) : view === "board" ? (
        <>
          <Kanban
            items={shown}
            onMove={moveTicket}
            renderCard={(t) => (
              <>
                <Link href={`/tickets/${t.id}`} className="kt">#{t.ticket_no} · {t.title}</Link>
                <div className="km">
                  <TypeBadge type={t.type} />
                  <PriorityBadge priority={t.priority} label={false} />
                  <span>{t.creator_name || t.creator_email}</span>
                </div>
                <div className="km">
                  <span>{t.assigned_to ? (t.assigned_to === me.id ? "Me" : t.assignee_name) : "Unassigned"}</span>
                  {t.target_on && <span className={`due ${isOverdue(t.target_on, t.status, t.target_at) ? "late" : ""}`}>Due {fmtDue(t.target_on, t.target_at)}</span>}
                </div>
              </>
            )}
          />
          <p className="fine" style={{ marginTop: 6 }}>
            Drag a card to another column to change its status. {isAdmin ? "" : "You can only move tickets that are unassigned or assigned to you. "}Resolved and Closed columns show the last {DONE_DAYS} days.
          </p>
        </>
      ) : shown.length === 0 ? (
        <div className="card empty">
          <b>No tickets match</b>
          <p>Try clearing a filter.</p>
        </div>
      ) : (
        <div className="card tw">
          <table className="tbl stack">
            <thead>
              <tr>
                <th>#</th>
                <th>Ticket</th>
                <th>Raised by</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Target</th>
                <th>Assigned to</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id}>
                  <td className="mono meta" data-l="#">{t.ticket_no}</td>
                  <td className="first" style={{ maxWidth: 360 }}>
                    <Link href={`/tickets/${t.id}`} className="nm" style={{ color: "var(--fg)" }}>
                      {t.title}
                    </Link>
                    <div className="meta" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 3, flexWrap: "wrap" }}>
                      <TypeBadge type={t.type} />
                      {t.category} · {t.raised_on ? fmtDay(t.raised_on) : fmtDate(t.created_at)}{t.closed_on ? ` → closed ${fmtDay(t.closed_on)}` : ""}
                    </div>
                  </td>
                  <td data-l="Raised by">
                    <div>{t.creator_name || t.creator_email}</div>
                    <div className="meta">{[t.unit, t.department].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td data-l="Priority">
                    <PriorityBadge priority={t.priority} />
                  </td>
                  <td data-l="Status">
                    <StatusBadge status={t.status} />
                  </td>
                  <td data-l="Target">
                    {t.target_on ? (
                      <span className={`due ${isOverdue(t.target_on, t.status, t.target_at) ? "late" : ""}`}>{fmtDue(t.target_on, t.target_at)}</span>
                    ) : isActive(t) ? (
                      <span className="meta">not set</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td data-l="Assigned to">
                    {isAdmin ? (
                      <select
                        className="in sel"
                        aria-label={`Assign ticket ${t.ticket_no}`}
                        style={{ padding: "6px 9px" }}
                        value={t.assigned_to || ""}
                        onChange={(e) => assign(t, e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {admins.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.full_name || a.email}
                          </option>
                        ))}
                      </select>
                    ) : t.assigned_to ? (
                      <span>{t.assigned_to === me.id ? "Me" : t.assignee_name}</span>
                    ) : (
                      <button className="btn pri sm" onClick={() => assign(t, me.id)}>
                        Assign to me
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function TicketsPage() {
  return (
    <AppShell staffOnly>
      <Dashboard />
    </AppShell>
  );
}
