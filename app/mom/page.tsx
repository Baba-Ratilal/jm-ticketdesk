"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import { fmtDay, todayStr } from "@/lib/constants";
import { MOM_STATUSES, type MomPoint } from "@/lib/mom";

type Staff = { id: string; full_name: string | null; login_id: string | null };
type Draft = { mom_on: string; point: string; target_on: string; status: string; assigned_to: string; remark: string };

const toDraft = (m: MomPoint): Draft => ({
  mom_on: m.mom_on, point: m.point, target_on: m.target_on ?? "", status: m.status, assigned_to: m.assigned_to ?? "", remark: m.remark ?? "",
});
const blank = (): Draft => ({ mom_on: todayStr(), point: "", target_on: "", status: "Open", assigned_to: "", remark: "" });
const tone = (s: string) => (s === "Done" ? "var(--ok, #2e9e6b)" : s === "In Progress" ? "var(--accent)" : s === "On Hold" ? "var(--fg-3)" : "inherit");

function Mom() {
  const [items, setItems] = useState<MomPoint[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [add, setAdd] = useState<Draft>(blank());
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blank());
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("pending");
  const [fOwner, setFOwner] = useState("");
  const [saveErr, setSaveErr] = useState("");

  async function load() {
    try {
      const d = await api<{ items: MomPoint[]; staff: Staff[]; canEdit: boolean }>("/api/mom");
      setItems(d.items); setStaff(d.staff); setCanEdit(d.canEdit); setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function send(url: string, method: string, body?: unknown) {
    setBusy(true); setSaveErr("");
    try {
      await api(url, { method, body: body ? JSON.stringify(body) : undefined });
      await load();
      return true;
    } catch (e) {
      setSaveErr((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const body = (d: Draft) => ({ ...d, target_on: d.target_on || null, assigned_to: d.assigned_to || null });

  const today = todayStr();
  const shown = items.filter((m) => {
    if (fStatus === "pending" && m.status === "Done") return false;
    if (fStatus && fStatus !== "pending" && fStatus !== "all" && m.status !== fStatus) return false;
    if (fOwner === "none" && m.assigned_to) return false;
    if (fOwner && fOwner !== "none" && m.assigned_to !== fOwner) return false;
    if (q && !`${m.sr_no} ${m.point} ${m.remark ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const ownerSel = (v: string, on: (v: string) => void) => (
    <select className="in sel" aria-label="Assigned to" value={v} onChange={(e) => on(e.target.value)}>
      <option value="">Unassigned</option>
      {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.login_id}</option>)}
    </select>
  );
  const statusSel = (v: string, on: (v: string) => void) => (
    <select className="in sel" aria-label="Status" value={v} onChange={(e) => on(e.target.value)}>
      {MOM_STATUSES.map((s) => <option key={s}>{s}</option>)}
    </select>
  );

  return (
    <>
      <div className="ph">
        <div>
          <h1>MOM</h1>
          <p className="sub">
            Action points from meetings.{canEdit ? " You can add and edit every column." : " You can update the status and add a remark."}
          </p>
        </div>
        {canEdit && <button className="btn pri" onClick={() => { setAdding(!adding); setAdd(blank()); setSaveErr(""); }}>{adding ? "Close" : "+ Add point"}</button>}
      </div>

      {canEdit && adding && (
        <form
          className="card pad form" style={{ marginBottom: 14 }}
          onSubmit={async (e) => { e.preventDefault(); if (await send("/api/mom", "POST", body(add))) setAdding(false); }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            <label>MOM date<input className="in" type="date" required value={add.mom_on} onChange={(e) => setAdd({ ...add, mom_on: e.target.value })} /></label>
            <label>Target date<input className="in" type="date" value={add.target_on} onChange={(e) => setAdd({ ...add, target_on: e.target.value })} /></label>
            <label>Assigned to{ownerSel(add.assigned_to, (v) => setAdd({ ...add, assigned_to: v }))}</label>
            <label>Status{statusSel(add.status, (v) => setAdd({ ...add, status: v }))}</label>
          </div>
          <label>Point<textarea className="in" required maxLength={1000} value={add.point} onChange={(e) => setAdd({ ...add, point: e.target.value })} /></label>
          <label>Remark (optional)<input className="in" maxLength={1000} value={add.remark} onChange={(e) => setAdd({ ...add, remark: e.target.value })} /></label>
          {saveErr && <p className="err" role="alert">{saveErr}</p>}
          <div><button className="btn pri" disabled={busy}>{busy ? "Saving…" : "Add point"}</button></div>
        </form>
      )}

      <div className="tools">
        <div className="search">
          <Icon name="search" size={16} />
          <input className="in" placeholder="Search point or remark…" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="in sel" aria-label="Status filter" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="pending">Pending (not done)</option>
          <option value="all">All</option>
          {MOM_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="in sel" aria-label="Owner filter" value={fOwner} onChange={(e) => setFOwner(e.target.value)}>
          <option value="">Anyone</option>
          <option value="none">Unassigned</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.login_id}</option>)}
        </select>
      </div>

      {error ? (
        <p className="err" role="alert">{error}</p>
      ) : loading ? (
        <p className="sub">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="card empty"><b>No points</b><p>{canEdit ? "Add the first point, or clear a filter." : "Nothing matches the filter."}</p></div>
      ) : (
        <div className="card tw">
          {saveErr && !adding && <p className="err" role="alert" style={{ padding: "10px 16px" }}>{saveErr}</p>}
          <table className="tbl stack">
            <thead>
              <tr><th>Sr no</th><th>MOM date</th><th>Point</th><th>Target date</th><th>Status</th><th>Assigned to</th><th>Remark</th><th /></tr>
            </thead>
            <tbody>
              {shown.map((m) => {
                const overdue = !!m.target_on && m.target_on < today && m.status !== "Done";
                if (editing === m.id) {
                  return (
                    <tr key={m.id}>
                      <td className="mono meta" data-l="Sr no">{m.sr_no}</td>
                      <td data-l="MOM date"><input className="in" type="date" value={draft.mom_on} onChange={(e) => setDraft({ ...draft, mom_on: e.target.value })} /></td>
                      <td className="first" data-l="Point"><textarea className="in" style={{ minHeight: 60 }} value={draft.point} onChange={(e) => setDraft({ ...draft, point: e.target.value })} /></td>
                      <td data-l="Target date"><input className="in" type="date" value={draft.target_on} onChange={(e) => setDraft({ ...draft, target_on: e.target.value })} /></td>
                      <td data-l="Status">{statusSel(draft.status, (v) => setDraft({ ...draft, status: v }))}</td>
                      <td data-l="Assigned to">{ownerSel(draft.assigned_to, (v) => setDraft({ ...draft, assigned_to: v }))}</td>
                      <td data-l="Remark"><input className="in" maxLength={1000} value={draft.remark} onChange={(e) => setDraft({ ...draft, remark: e.target.value })} /></td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="btn sm pri" disabled={busy} onClick={async () => { if (await send(`/api/mom/${m.id}`, "PATCH", body(draft))) setEditing(null); }}>Save</button>{" "}
                        <button className="btn sm" onClick={() => { setEditing(null); setSaveErr(""); }}>Cancel</button>
                      </td>
                    </tr>
                  );
                }
                return (
                  <MomRow
                    key={m.id} m={m} canEdit={canEdit} overdue={overdue} busy={busy} statusSel={statusSel}
                    onQuick={(patch) => send(`/api/mom/${m.id}`, "PATCH", patch)}
                    onEdit={() => { setEditing(m.id); setDraft(toDraft(m)); setSaveErr(""); }}
                    onDelete={() => { if (confirm(`Delete point ${m.sr_no}?`)) send(`/api/mom/${m.id}`, "DELETE"); }}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Read-only row; IT team (and admin) change the status or remark right here and press Save. */
function MomRow({ m, canEdit, overdue, busy, statusSel, onQuick, onEdit, onDelete }: {
  m: MomPoint; canEdit: boolean; overdue: boolean; busy: boolean;
  statusSel: (v: string, on: (v: string) => void) => React.ReactNode;
  onQuick: (p: { status: string; remark: string }) => Promise<boolean>;
  onEdit: () => void; onDelete: () => void;
}) {
  const [status, setStatus] = useState(m.status);
  const [remark, setRemark] = useState(m.remark ?? "");
  useEffect(() => { setStatus(m.status); setRemark(m.remark ?? ""); }, [m.status, m.remark]);
  const dirty = status !== m.status || remark !== (m.remark ?? "");
  return (
    <tr>
      <td className="mono meta" data-l="Sr no">{m.sr_no}</td>
      <td data-l="MOM date" style={{ whiteSpace: "nowrap" }}>{fmtDay(m.mom_on)}</td>
      <td className="first" data-l="Point" style={{ maxWidth: 380, whiteSpace: "pre-wrap" }}>{m.point}</td>
      <td data-l="Target date" style={{ whiteSpace: "nowrap", color: overdue ? "var(--danger, #c0372f)" : undefined, fontWeight: overdue ? 600 : undefined }}>
        {m.target_on ? fmtDay(m.target_on) : "—"}{overdue ? " · overdue" : ""}
      </td>
      <td data-l="Status">{statusSel(status, setStatus)}</td>
      <td data-l="Assigned to">{m.assignee_name || "—"}</td>
      <td data-l="Remark"><input className="in" maxLength={1000} aria-label="Remark" placeholder="Add a remark" value={remark} onChange={(e) => setRemark(e.target.value)} /></td>
      <td style={{ whiteSpace: "nowrap" }}>
        {dirty && <button className="btn sm pri" disabled={busy} onClick={() => onQuick({ status, remark })}>Save</button>}
        {canEdit && !dirty && (
          <>
            <button className="btn sm" onClick={onEdit}>Edit</button>{" "}
            <button className="btn sm" onClick={onDelete} aria-label={`Delete point ${m.sr_no}`}>Delete</button>
          </>
        )}
      </td>
    </tr>
  );
}

export default function MomPage() {
  return (
    <AppShell staffOnly>
      <Mom />
    </AppShell>
  );
}
