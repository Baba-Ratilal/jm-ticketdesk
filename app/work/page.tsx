"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell, { useProfile } from "@/components/AppShell";
import { PriorityBadge, StatusBadge, TypeBadge } from "@/components/Badges";
import { api } from "@/lib/api";
import { priorityLevel } from "@/lib/constants";

type Item = { id: string; kind: "Ticket" | "Issue"; no: number; type: string; title: string; priority: string; status: string; created_at: string };
type Member = { id: string; full_name: string | null; login_id: string | null; role: string; tickets: number; issues: number; urgent: number };
type Work = {
  tickets: (Omit<Item, "kind" | "no"> & { ticket_no: number })[];
  issues: (Omit<Item, "kind" | "no"> & { issue_no: number })[];
  unassigned: number;
  team: Member[];
};

const age = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));

function MyWork() {
  const me = useProfile()!;
  const [w, setW] = useState<Work | null>(null);

  useEffect(() => {
    const load = () => api<Work>("/api/work").then(setW).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  const items = useMemo<Item[]>(() => {
    if (!w) return [];
    const all: Item[] = [
      ...w.tickets.map((t) => ({ ...t, kind: "Ticket" as const, no: t.ticket_no })),
      ...w.issues.map((i) => ({ ...i, kind: "Issue" as const, no: i.issue_no })),
    ];
    // most urgent first, then the one waiting longest
    return all.sort((a, b) => (priorityLevel[b.priority] || 0) - (priorityLevel[a.priority] || 0) || +new Date(a.created_at) - +new Date(b.created_at));
  }, [w]);

  if (!w) return <p className="sub">Loading…</p>;

  return (
    <>
      <div className="ph">
        <div>
          <h1>My work</h1>
          <p className="sub">
            Everything assigned to you, most urgent first. A summary also reaches your inbox at 9 AM, 2 PM and 4 PM.
          </p>
        </div>
      </div>

      <div className="card tw" style={{ marginBottom: 16 }}>
        {items.length === 0 ? (
          <div className="empty" style={{ padding: 22 }}>
            <b>Nothing assigned to you</b>
            <p>
              {w.unassigned > 0 ? (
                <>There {w.unassigned === 1 ? "is" : "are"} {w.unassigned} unassigned ticket{w.unassigned === 1 ? "" : "s"} in the <Link href="/admin" style={{ color: "var(--accent)" }}>queue</Link>.</>
              ) : (
                "The queue is clear."
              )}
            </p>
          </div>
        ) : (
          <table className="tbl stack">
            <thead>
              <tr><th>Item</th><th>Priority</th><th>Status</th><th>Waiting</th></tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={`${i.kind}${i.id}`}>
                  <td className="first" style={{ maxWidth: 420 }}>
                    <Link href={i.kind === "Ticket" ? `/tickets/${i.id}` : `/issues/${i.id}`} className="nm" style={{ color: "var(--fg)" }}>
                      {i.kind === "Ticket" ? "#" : "Issue #"}{i.no} · {i.title}
                    </Link>
                    <div className="meta" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 3 }}>
                      <TypeBadge type={i.type} /> {i.kind}
                    </div>
                  </td>
                  <td data-l="Priority"><PriorityBadge priority={i.priority} /></td>
                  <td data-l="Status"><StatusBadge status={i.status} /></td>
                  <td data-l="Waiting">{age(i.created_at)} day{age(i.created_at) === 1 ? "" : "s"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {w.unassigned > 0 && items.length > 0 && (
        <p className="sub" style={{ marginBottom: 16 }}>
          {w.unassigned} unassigned ticket{w.unassigned === 1 ? "" : "s"} waiting in the <Link href="/admin" style={{ color: "var(--accent)" }}>queue</Link>.
        </p>
      )}

      {me.role === "admin" && w.team.length > 0 && (
        <>
          <div className="sec-h">Team</div>
          <div className="card tw">
            <table className="tbl stack">
              <thead>
                <tr><th>Person</th><th>Active tickets</th><th>Active issues</th><th>High / Critical</th></tr>
              </thead>
              <tbody>
                {w.team.map((m) => (
                  <tr key={m.id}>
                    <td className="first"><div className="nm">{m.full_name || m.login_id}</div><div className="meta">{m.role === "admin" ? "Admin" : "IT team"}</div></td>
                    <td data-l="Tickets">{m.tickets}</td>
                    <td data-l="Issues">{m.issues}</td>
                    <td data-l="High / Critical">{m.urgent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

export default function WorkPage() {
  return (
    <AppShell staffOnly>
      <MyWork />
    </AppShell>
  );
}
