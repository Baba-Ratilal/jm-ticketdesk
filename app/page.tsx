"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell, { useProfile } from "@/components/AppShell";
import { PriorityBadge, StatusBadge, TypeBadge } from "@/components/Badges";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import { fmtDate, fmtDay, fmtDue, type Ticket } from "@/lib/constants";

function MyTickets() {
  const profile = useProfile()!;
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"active" | "all">("active");

  useEffect(() => {
    api<{ tickets: Ticket[] }>("/api/tickets")
      .then((d) => setTickets(d.tickets))
      .finally(() => setLoading(false));
  }, []);

  const isActive = (t: Ticket) => !["Resolved", "Closed"].includes(t.status);
  const shown = tickets.filter((t) => filter === "all" || isActive(t));
  const open = tickets.filter(isActive).length;

  return (
    <>
      <div className="ph">
        <div>
          <h1>Hello, {profile.full_name?.split(" ")[0] || "there"}</h1>
          <p className="sub">
            {open} open ticket{open === 1 ? "" : "s"} · {tickets.length} in total
          </p>
        </div>
        <div className="acts">
          <div className="segs">
            {(["active", "all"] as const).map((f) => (
              <button key={f} className={`seg ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
                {f === "active" ? "Active" : "All"}
              </button>
            ))}
          </div>
          <Link href="/tickets/new" className="btn pri">
            <Icon name="plus" size={16} /> New ticket
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="sub">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="card empty">
          <b>No tickets here yet</b>
          <p>Facing an IT or ERP issue? Raise a ticket and we'll pick it up.</p>
          <Link href="/tickets/new" className="btn pri" style={{ marginTop: 8 }}>
            <Icon name="plus" size={16} /> New ticket
          </Link>
        </div>
      ) : (
        <div className="card">
          {shown.map((t) => (
            <Link key={t.id} href={`/tickets/${t.id}`} className="lr">
              <div className="grow">
                <div className="nm">{t.title}</div>
                <div className="meta">
                  <span className="mono">#{t.ticket_no}</span> · {t.category} · {t.raised_on ? fmtDay(t.raised_on) : fmtDate(t.created_at)}{t.target_on && !["Resolved", "Closed"].includes(t.status) ? ` · target ${fmtDue(t.target_on, t.target_at)}` : ""}
                  {t.assignee_name && (
                    <>
                      {" "}· Handled by {t.assignee_name}
                      {t.assignee_phone ? ` (${t.assignee_phone})` : ""}
                    </>
                  )}
                </div>
              </div>
              <div className="right">
                <TypeBadge type={t.type} />
                <PriorityBadge priority={t.priority} />
                <StatusBadge status={t.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function Home() {
  return (
    <AppShell>
      <MyTickets />
    </AppShell>
  );
}
