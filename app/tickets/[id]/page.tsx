"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AppShell, { useProfile } from "@/components/AppShell";
import { PriorityBadge, StatusBadge, TypeBadge } from "@/components/Badges";
import Icon from "@/components/Icon";
import ScreenshotPicker from "@/components/ScreenshotPicker";
import { api } from "@/lib/api";
import { fmtDate, fmtDay, fmtDue, todayStr, isOverdue, PRIORITIES, STATUSES, type Ticket } from "@/lib/constants";

type Comment = {
  id: string;
  author_id: string;
  author_name: string | null;
  author_role: string;
  body: string;
  internal: boolean;
  created_at: string;
};
type Attachment = { id: string; comment_id: string | null; file_name: string };
type EventRow = { id: string; actor_name: string | null; action: string; detail: string | null; created_at: string };
type Admin = { id: string; email: string; full_name: string | null; phone?: string | null };
type LinkedIssue = { id: string; issue_no: number; title: string; status: string };
type TargetOld = { id: string; target_on: string; target_at: string | null; superseded_at: string; changed_by: string | null };
type Detail = { target_history?: TargetOld[]; ticket: Ticket; comments: Comment[]; attachments: Attachment[]; events: EventRow[]; admins: Admin[]; issues?: LinkedIssue[] };

const fileUrl = (a: Attachment) => `/api/files/${a.id}`;

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="row">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );
}

function Shots({ list, onOpen, small }: { list: Attachment[]; onOpen: (u: string) => void; small?: boolean }) {
  if (!list.length) return null;
  return (
    <div className="shots" style={{ marginTop: 12, gridTemplateColumns: small ? "repeat(auto-fill,minmax(100px,1fr))" : undefined }}>
      {list.map((a) => (
        <button key={a.id} className="shot" onClick={() => onOpen(fileUrl(a))} aria-label={`Open ${a.file_name}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fileUrl(a)} alt={a.file_name} style={small ? { height: 72 } : undefined} />
        </button>
      ))}
    </div>
  );
}

function TicketView() {
  const { id } = useParams<{ id: string }>();
  const me = useProfile()!;
  const isAdmin = me.role === "admin";
  const isStaff = me.role !== "user";

  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Detail>(`/api/tickets/${id}`));
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // draft target date / time: nothing is saved until the person confirms
  const [tgtDate, setTgtDate] = useState("");
  const [tgtTime, setTgtTime] = useState("");
  useEffect(() => {
    setTgtDate(data?.ticket.target_on || "");
    setTgtTime(data?.ticket.target_at || "");
  }, [data]);

  async function saveTarget(date: string, time: string, question: string) {
    if (!confirm(question)) return;
    await update({ target_on: date || null, target_at: date ? time || null : null, confirm: true });
  }

  async function update(patch: Record<string, string | boolean | null>) {
    try {
      await api(`/api/tickets/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() && !files.length) return;
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("body", reply);
      fd.append("internal", String(isStaff && internal));
      files.forEach((f) => fd.append("files", f));
      await api(`/api/tickets/${id}/comments`, { method: "POST", body: fd });
      setReply("");
      setFiles([]);
      setInternal(false);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="sub">Loading…</p>;
  if (notFound || !data)
    return (
      <div className="card empty">
        <b>Ticket not found</b>
        <Link href="/" className="btn" style={{ marginTop: 8 }}>
          Back
        </Link>
      </div>
    );

  const { ticket, comments, attachments, events, admins } = data;
  const issues = data.issues ?? [];
  const ticketShots = attachments.filter((a) => !a.comment_id);

  return (
    <>
      <Link href={isStaff ? "/admin" : "/"} className="btn sm" style={{ marginBottom: 14 }}>
        <Icon name="back" size={14} /> Back
      </Link>

      <div className="ph">
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <TypeBadge type={ticket.type} />
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          <h1>Ticket #{ticket.ticket_no}</h1>
          <p className="sub">
            Raised by {ticket.creator_name || ticket.creator_email} · {ticket.raised_on ? fmtDay(ticket.raised_on) : fmtDate(ticket.created_at)}
          </p>
        </div>
      </div>

      <div className="two">
        {/* LEFT */}
        <div className="col">
          <div className="card pad">
            <div className="sec-h">Issue</div>
            <p className="desc">{ticket.description}</p>
            <Shots list={ticketShots} onOpen={setLightbox} />
          </div>

          <div className="col">
            <div className="sec-h" style={{ margin: "4px 2px 0" }}>Conversation</div>
            {comments.length === 0 && <p className="sub">No replies yet.</p>}
            {comments.map((c) => {
              const shots = attachments.filter((a) => a.comment_id === c.id);
              return (
                <div key={c.id} className={`cm ${c.internal ? "int" : c.author_role === "admin" ? "sup" : ""}`}>
                  <div className="cm-h">
                    <span>
                      <b>{c.author_name || "Unknown"}</b>
                      {c.author_role === "admin" && !c.internal && <span className="tag">SUPPORT</span>}
                      {c.internal && <span className="tag int">INTERNAL NOTE</span>}
                    </span>
                    <span>{fmtDate(c.created_at)}</span>
                  </div>
                  <p className="desc" style={{ marginTop: 8 }}>{c.body}</p>
                  <Shots list={shots} onOpen={setLightbox} small />
                </div>
              );
            })}

            {ticket.status !== "Closed" && (
              <form onSubmit={sendReply} className="card pad form">
                {isStaff ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div className="sec-h" style={{ marginBottom: 0 }}>
                      {internal ? "Internal note" : `Reply to ${ticket.creator_name || "the user"}`}
                    </div>
                    <div className="segs" role="group" aria-label="Reply type">
                      <button type="button" className={`seg ${!internal ? "on" : ""}`} onClick={() => setInternal(false)}>
                        Reply to user
                      </button>
                      <button type="button" className={`seg ${internal ? "on" : ""}`} onClick={() => setInternal(true)}>
                        Internal note
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="sec-h" style={{ marginBottom: 0 }}>Add a reply</div>
                )}
                <textarea
                  className="in"
                  placeholder={isStaff ? (internal ? "Note for the IT team only. The user will not see this." : "Write your reply to the user…") : "Add a reply or more details…"}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  maxLength={5000}
                />
                <ScreenshotPicker files={files} onChange={setFiles} max={4} />
                {error && <p className="alert bad">{error}</p>}
                <div className="acts" style={{ justifyContent: "space-between" }}>
                  <span className="fine">{isStaff && internal ? "Visible to admins and the IT team only." : ""}</span>
                  <button className="btn pri" disabled={busy}>
                    {busy ? "Sending…" : isStaff && internal ? "Add note" : "Send reply"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* RIGHT */}
        <aside className="col">
          <div className="card pad">
            <div className="sec-h">Details</div>
            <Row k="Category" v={ticket.category} />
            <Row k="Unit" v={ticket.unit || "—"} />
            <Row k="Department" v={ticket.department || "—"} />
            {ticket.type === "ERP" && (
              <>
                <Row k="ERP module" v={ticket.erp_module || "—"} />
                <Row k="Screen" v={ticket.erp_screen || "—"} />
              </>
            )}
            <Row
              k="Target date"
              v={ticket.target_on ? `${fmtDue(ticket.target_on, ticket.target_at)}${isOverdue(ticket.target_on, ticket.status, ticket.target_at) ? " · overdue" : ""}` : "Not set yet"}
            />
            {(data.target_history ?? []).length > 0 && (
              <div className="row" style={{ display: "block" }}>
                <span>Earlier targets</span>
                {(data.target_history ?? []).map((h) => (
                  <div key={h.id} className="fine">
                    <s>{fmtDue(h.target_on, h.target_at)}</s>
                    {` · changed ${fmtDate(h.superseded_at)}${h.changed_by ? ` by ${h.changed_by}` : ""}`}
                  </div>
                ))}
              </div>
            )}
            <Row k="Assigned to" v={ticket.assignee_name || "Not assigned yet"} />
            {ticket.assignee_name && ticket.assignee_phone && (
              <div className="row">
                <span>Contact</span>
                <b>
                  <a href={`tel:${ticket.assignee_phone.replace(/[^0-9+]/g, "")}`} style={{ color: "var(--accent)" }}>
                    {ticket.assignee_phone}
                  </a>
                </b>
              </div>
            )}
            {ticket.closed_on ? <Row k="Closing date" v={fmtDay(ticket.closed_on)} /> : ticket.resolved_at ? <Row k="Resolved" v={fmtDate(ticket.resolved_at)} /> : null}
          </div>

          {isStaff && (
            <div className="card pad form" style={{ gap: 12 }}>
              <div className="sec-h" style={{ marginBottom: 0 }}>Manage</div>
              {(ticket.status === "Resolved" || ticket.status === "Closed") && (
                <div className="fld">
                  <label className="lbl" htmlFor="m_cd">Closing date</label>
                  <input
                    id="m_cd" className="in" type="date" max={todayStr()} min={ticket.raised_on || undefined}
                    value={ticket.closed_on || ""}
                    onChange={(e) => e.target.value && update({ closed_on: e.target.value })}
                  />
                </div>
              )}
              {isAdmin ? (
                <div className="fld">
                  <label className="lbl" htmlFor="m_as">Assign to</label>
                  <select
                    id="m_as"
                    className="in"
                    value={ticket.assigned_to || ""}
                    onChange={(e) => update({ assigned_to: e.target.value || null })}
                  >
                    <option value="">Unassigned</option>
                    {admins.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.full_name || a.email}
                      </option>
                    ))}
                  </select>
                </div>
              ) : !ticket.assigned_to ? (
                <button type="button" className="btn pri" onClick={() => update({ assigned_to: me.id })}>
                  Assign to me
                </button>
              ) : (
                <button type="button" className="btn" onClick={() => update({ assigned_to: null })}>
                  Hand back to the queue
                </button>
              )}
              <div className="fld">
                <label className="lbl" htmlFor="m_st">Status</label>
                <select id="m_st" className="in" value={ticket.status} onChange={(e) => update({ status: e.target.value })}>
                  {STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="fld">
                <label className="lbl" htmlFor="m_td">Target date</label>
                <div className="acts">
                  <input
                    id="m_td"
                    type="date"
                    className="in"
                    min={ticket.created_at.slice(0, 10)}
                    value={tgtDate}
                    onChange={(e) => setTgtDate(e.target.value)}
                  />
                  <input
                    type="time"
                    className="in"
                    aria-label="Target time (optional)"
                    disabled={!tgtDate}
                    value={tgtTime}
                    onChange={(e) => setTgtTime(e.target.value)}
                  />
                </div>
                {(tgtDate !== (ticket.target_on || "") || tgtTime !== (ticket.target_at || "")) && tgtDate && (
                  <div className="acts" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn pri sm"
                      onClick={() =>
                        saveTarget(
                          tgtDate,
                          tgtTime,
                          ticket.target_on
                            ? `Change the target from ${fmtDue(ticket.target_on, ticket.target_at)} to ${fmtDue(tgtDate, tgtTime)}?\n\nThe earlier date stays on record, struck through, and the requester will see the new one.`
                            : `Set the target to ${fmtDue(tgtDate, tgtTime)}?\n\nThe requester will see this date.`
                        )
                      }
                    >
                      {ticket.target_on ? "Change target…" : "Set target…"}
                    </button>
                    <button type="button" className="btn sm" onClick={() => { setTgtDate(ticket.target_on || ""); setTgtTime(ticket.target_at || ""); }}>
                      Cancel
                    </button>
                  </div>
                )}
                {ticket.target_on && tgtDate === ticket.target_on && tgtTime === (ticket.target_at || "") && (
                  <div className="acts" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn sm danger"
                      onClick={() => saveTarget("", "", `Remove the target ${fmtDue(ticket.target_on, ticket.target_at)}? It stays on record, struck through.`)}
                    >
                      Remove target
                    </button>
                  </div>
                )}
                <p className="fine" style={{ marginTop: 4 }}>The date (and, if you like, the time) we promise the requester. Every confirmed change is kept on record. Used for on-time delivery %.</p>

              </div>
              <div className="fld">
                <label className="lbl" htmlFor="m_pr">Priority</label>
                <select id="m_pr" className="in" value={ticket.priority} onChange={(e) => update({ priority: e.target.value })}>
                  {PRIORITIES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {isStaff && (
            <div className="card pad">
              <div className="sec-h">Issues</div>
              {issues.length === 0 && <p className="sub" style={{ marginBottom: 10 }}>Not part of any issue yet.</p>}
              {issues.map((i) => (
                <div key={i.id} className="row">
                  <Link href={`/issues/${i.id}`} style={{ color: "var(--accent)" }}>#{i.issue_no} · {i.title}</Link>
                  <StatusBadge status={i.status} />
                </div>
              ))}
              <Link href={`/issues/new?ticket=${ticket.id}`} className="btn sm" style={{ marginTop: 10 }}>
                Create issue from this ticket
              </Link>
            </div>
          )}

          <div className="card pad">
            <div className="sec-h">Timeline</div>
            <ol className="tl">
              {events.map((ev) => (
                <li key={ev.id}>
                  <b>{ev.action}</b>
                  {ev.detail && <div style={{ color: "var(--fg-2)" }}>{ev.detail}</div>}
                  <div className="fine">
                    {ev.actor_name || "—"} · {fmtDate(ev.created_at)}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" />
        </div>
      )}
    </>
  );
}

export default function TicketPage() {
  return (
    <AppShell>
      <TicketView />
    </AppShell>
  );
}
