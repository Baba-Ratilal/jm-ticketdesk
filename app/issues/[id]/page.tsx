"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { PriorityBadge, StatusBadge, TypeBadge } from "@/components/Badges";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import { fmtDate, fmtDay, PRIORITIES, STATUSES, type Issue } from "@/lib/constants";

type Staff = { id: string; full_name: string | null; login_id: string | null };
type Comment = { id: string; author_name: string | null; body: string; created_at: string };
type EventRow = { id: string; actor_name: string | null; action: string; detail: string | null; created_at: string };
type Linked = { id: string; ticket_no: number; title: string; status: string; priority: string; type: string };
type Detail = { issue: Issue; comments: Comment[]; events: EventRow[]; tickets: Linked[]; staff: Staff[] };

function IssueView() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [note, setNote] = useState("");
  const [ticketNo, setTicketNo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<Detail>(`/api/issues/${id}`));
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  async function update(patch: Record<string, string | null>) {
    try {
      await api(`/api/issues/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/issues/${id}/comments`, { method: "POST", body: JSON.stringify({ body: note }) });
      setNote("");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function link(e: React.FormEvent) {
    e.preventDefault();
    if (!ticketNo.trim()) return;
    try {
      await api(`/api/issues/${id}/tickets`, { method: "POST", body: JSON.stringify({ ticket_no: ticketNo }) });
      setTicketNo("");
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function unlink(t: Linked) {
    if (!confirm(`Unlink ticket #${t.ticket_no} from this issue?`)) return;
    try {
      await api(`/api/issues/${id}/tickets?ticket_id=${t.id}`, { method: "DELETE" });
      load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  if (loading) return <p className="sub">Loading…</p>;
  if (notFound || !data)
    return (
      <div className="card empty">
        <b>Issue not found</b>
        <Link href="/issues" className="btn" style={{ marginTop: 8 }}>Back</Link>
      </div>
    );

  const { issue, comments, events, tickets, staff } = data;

  return (
    <>
      <Link href="/issues" className="btn sm" style={{ marginBottom: 14 }}><Icon name="back" size={14} /> Back</Link>
      <div className="ph">
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <TypeBadge type={issue.type} />
            <StatusBadge status={issue.status} />
            <PriorityBadge priority={issue.priority} />
          </div>
          <h1>Issue #{issue.issue_no}</h1>
          <p className="sub">Opened by {issue.creator_name} · {issue.raised_on ? fmtDay(issue.raised_on) : fmtDate(issue.created_at)}</p>
        </div>
      </div>

      <div className="two">
        <div className="col">
          <div className="card pad">
            <h2 style={{ fontSize: 20, marginBottom: 10 }}>{issue.title}</h2>
            {issue.description ? <p className="desc">{issue.description}</p> : <p className="sub">No details written yet.</p>}
          </div>

          <div className="card pad">
            <div className="sec-h">Linked tickets ({tickets.length})</div>
            {tickets.length === 0 && <p className="sub" style={{ marginBottom: 10 }}>No tickets linked yet.</p>}
            {tickets.map((t) => (
              <div key={t.id} className="lr" style={{ padding: "8px 0" }}>
                <Link href={`/tickets/${t.id}`} className="grow">
                  <div className="nm">#{t.ticket_no} · {t.title}</div>
                  <div className="meta" style={{ display: "flex", gap: 8, marginTop: 3 }}><TypeBadge type={t.type} /><StatusBadge status={t.status} /></div>
                </Link>
                <button className="btn sm" onClick={() => unlink(t)}>Unlink</button>
              </div>
            ))}
            <form onSubmit={link} className="acts" style={{ marginTop: 10 }}>
              <input className="in" style={{ maxWidth: 200 }} inputMode="numeric" placeholder="Ticket number, e.g. 1004" aria-label="Ticket number" value={ticketNo} onChange={(e) => setTicketNo(e.target.value)} />
              <button className="btn">Link ticket</button>
            </form>
          </div>

          <div className="col">
            <div className="sec-h" style={{ margin: "4px 2px 0" }}>Notes</div>
            {comments.length === 0 && <p className="sub">No notes yet.</p>}
            {comments.map((c) => (
              <div key={c.id} className="cm">
                <div className="cm-h"><b>{c.author_name || "Unknown"}</b><span>{fmtDate(c.created_at)}</span></div>
                <p className="desc" style={{ marginTop: 8 }}>{c.body}</p>
              </div>
            ))}
            <form onSubmit={addNote} className="card pad form">
              <textarea className="in" placeholder="Add a note for the IT team…" value={note} onChange={(e) => setNote(e.target.value)} maxLength={5000} />
              {error && <p className="alert bad">{error}</p>}
              <div className="acts" style={{ justifyContent: "flex-end" }}>
                <button className="btn pri" disabled={busy}>{busy ? "Saving…" : "Add note"}</button>
              </div>
            </form>
          </div>
        </div>

        <aside className="col">
          <div className="card pad form" style={{ gap: 12 }}>
            <div className="sec-h" style={{ marginBottom: 0 }}>Manage</div>
            <div className="fld">
              <label className="lbl" htmlFor="m_own">Owner</label>
              <select id="m_own" className="in" value={issue.assigned_to || ""} onChange={(e) => update({ assigned_to: e.target.value || null })}>
                <option value="">No owner</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.login_id}</option>)}
              </select>
            </div>
            <div className="fld">
              <label className="lbl" htmlFor="m_st">Status</label>
              <select id="m_st" className="in" value={issue.status} onChange={(e) => update({ status: e.target.value })}>
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="fld">
              <label className="lbl" htmlFor="m_pr">Priority</label>
              <select id="m_pr" className="in" value={issue.priority} onChange={(e) => update({ priority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            {issue.erp_module && (
              <div className="row"><span>ERP module</span><b>{issue.erp_module}</b></div>
            )}
          </div>

          <div className="card pad">
            <div className="sec-h">Timeline</div>
            <ol className="tl">
              {events.map((ev) => (
                <li key={ev.id}>
                  <b>{ev.action}</b>
                  {ev.detail && <div style={{ color: "var(--fg-2)" }}>{ev.detail}</div>}
                  <div className="fine">{ev.actor_name || "—"} · {fmtDate(ev.created_at)}</div>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </>
  );
}

export default function IssuePage() {
  return (
    <AppShell staffOnly>
      <IssueView />
    </AppShell>
  );
}
