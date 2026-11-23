"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import AppShell, { useProfile } from "@/components/AppShell";
import { api } from "@/lib/api";
import { fmtDate, fmtDay, todayStr } from "@/lib/constants";
import { DR_STATUS_PILL, reqLabel, STAGES, type DeviceItem, type DeviceRequest } from "@/lib/device";

function ItIssue({ item, requestId, onDone }: { item: DeviceItem; requestId: string; onDone: () => void }) {
  const [tag, setTag] = useState(item.asset_tag || "");
  const [on, setOn] = useState(item.issued_on || todayStr());
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api(`/api/device-requests/${requestId}`, { method: "PATCH", body: JSON.stringify({ action: "issue", item_id: item.id, asset_tag: tag, issued_on: on }) });
      onDone();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const changed = tag !== (item.asset_tag || "") || on !== (item.issued_on || "");
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr) auto", gap: 8, alignItems: "center" }}>
      <input className="in" placeholder="Asset tag / serial no." aria-label={`Asset tag for ${item.employee_name}`} maxLength={200} value={tag} onChange={(e) => setTag(e.target.value)} />
      <input className="in" type="date" max={todayStr()} aria-label="Issued on" value={on} onChange={(e) => setOn(e.target.value)} />
      <button className="btn sm pri" disabled={busy || !changed || tag.trim().length < 2} onClick={save}>{item.issued_on ? "Update" : "Mark issued"}</button>
    </div>
  );
}

function View() {
  const { id } = useParams<{ id: string }>();
  const me = useProfile()!;
  const router = useRouter();
  const [r, setR] = useState<DeviceRequest | null>(null);
  const [error, setError] = useState("");
  const [remark, setRemark] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      setR((await api<{ request: DeviceRequest }>(`/api/device-requests/${id}`)).request);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <p className="err" role="alert">{error}</p>;
  if (!r) return <p className="sub">Loading…</p>;

  const isAdmin = me.role === "admin";
  const isStaff = me.role !== "user";
  const pending = r.status.startsWith("Pending");
  const cur = pending ? r.approvals.find((a) => !a.decision) : undefined;
  const canDecide = !!cur && (cur.approver_id === me.id || isAdmin);
  const onBehalf = !!cur && cur.approver_id !== me.id;

  async function decide(action: "approve" | "reject") {
    setMsg("");
    if (action === "reject" && remark.trim().length < 3) return setMsg("Write the reason for rejecting.");
    if (action === "approve" && onBehalf && !proof) return setMsg(`Attach an image of ${cur?.approver_name || "the approver"}'s approval to approve on their behalf.`);
    if (!confirm(action === "approve" ? "Approve this request?" : "Reject this request?")) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("action", action);
      fd.set("remark", remark);
      if (proof) fd.set("proof", proof);
      await api(`/api/device-requests/${id}`, { method: "PATCH", body: fd });
      setRemark("");
      setProof(null);
      await load();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function simple(action: string, confirmText: string) {
    if (!confirm(confirmText)) return;
    try {
      await api(`/api/device-requests/${id}`, { method: "PATCH", body: JSON.stringify({ action }) });
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  async function remove() {
    if (!confirm("Delete this request for good? This cannot be undone.")) return;
    try {
      await api(`/api/device-requests/${id}`, { method: "DELETE" });
      router.replace("/device-requests");
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const stageBox = (title: string, name: string | null, state: string, date: string | null, note?: string | null, extra?: React.ReactNode) => (
    <div className="card pad" style={{ display: "grid", gap: 4, alignContent: "start" }}>
      <div className="sec-h" style={{ marginBottom: 2 }}>{title}</div>
      <div><b>{name || "—"}</b></div>
      <div className="fine">{state}{date ? ` · ${fmtDate(date)}` : ""}</div>
      {note && <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap" }}>“{note}”</div>}
      {extra}
    </div>
  );

  return (
    <>
      <div className="ph noprint">
        <div>
          <h1>{reqLabel(r.req_no)}</h1>
          <p className="sub"><Link href="/device-requests">← All device requests</Link></p>
        </div>
        <div className="acts">
          <button className="btn" onClick={() => window.print()}>Print / Save as PDF</button>
          {(r.requested_by === me.id || isAdmin) && pending && (
            <button className="btn" onClick={() => simple("cancel", "Cancel this request?")}>Cancel request</button>
          )}
          {isAdmin && <button className="btn" style={{ color: "var(--bad)" }} onClick={remove}>Delete</button>}
        </div>
      </div>

      <div className="card pad" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>JM ALUEXT PROFILE PRIVATE LIMITED</div>
            <div className="sub">Mobile & IT device requirement and allocation form</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="fine">Form No. <b>IT/MOB/01</b> · {reqLabel(r.req_no)}</div>
            <div className="fine">Requirement date <b>{fmtDay(r.requirement_on)}</b></div>
            <div style={{ marginTop: 6 }}><span className={`pill ${DR_STATUS_PILL[r.status] || "neutral"}`}>{r.status}</span></div>
          </div>
        </div>
      </div>

      <div className="card tw" style={{ marginBottom: 14 }}>
        <table className="tbl">
          <thead>
            <tr><th>Sr.</th><th>Employee</th><th>Unit / Department</th><th>Designation</th><th>Mobile</th><th>SIM</th><th>Laptop / PC</th><th>Accessories</th><th>Purpose</th></tr>
          </thead>
          <tbody>
            {r.items.map((i) => (
              <tr key={i.id}>
                <td>{i.sr_no}</td>
                <td className="first"><b>{i.employee_name}</b></td>
                <td>{[i.unit, i.department].filter(Boolean).join(" · ") || "—"}</td>
                <td>{i.designation || "—"}</td>
                <td>{i.mobile_type}</td>
                <td>{i.sim_required}</td>
                <td>{i.laptop_pc || "N/A"}</td>
                <td>{i.accessories || "N/A"}</td>
                <td style={{ minWidth: 200, whiteSpace: "pre-wrap" }}>{i.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12, marginBottom: 14 }}>
        {stageBox("Requested by", r.requester_name, "Submitted", r.created_at)}
        {STAGES.map((s) => {
          const a = r.approvals.find((x) => x.stage === s.stage);
          if (!a) return null;
          const state = a.decision ? (a.decision === "Approved" ? "Approved" : "Rejected") : r.status === "Cancelled" ? "—" : cur?.stage === s.stage ? "Waiting" : "Not yet";
          const behalf = a.decision && a.decided_by_name && a.decided_by_name !== a.approver_name ? `recorded by ${a.decided_by_name}` : null;
          return (
            <div key={s.stage}>
              {stageBox(
                `${s.label} approval`, a.approver_name, state, a.decided_at, a.remark,
                <>
                  {behalf && <div className="fine">{behalf}</div>}
                  {a.proof_file_id && (
                    <a href={`/api/device-requests/files/${a.proof_file_id}`} target="_blank" rel="noreferrer" className="fine">View approval image</a>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {canDecide && cur && (
        <div className="card pad form noprint" style={{ marginBottom: 14 }}>
          <div className="sec-h" style={{ marginBottom: 0 }}>
            {onBehalf ? `Record ${STAGES[cur.stage - 1].label} decision for ${cur.approver_name}` : `Your decision: ${STAGES[cur.stage - 1].label} approval`}
          </div>
          <label>Remark {onBehalf ? "(optional)" : "(required if rejecting)"}<textarea className="in" maxLength={500} value={remark} onChange={(e) => setRemark(e.target.value)} /></label>
          <label>
            Approval image {onBehalf ? "(required: signed form, message or e-mail screenshot)" : "(optional)"}
            <input className="in" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => setProof(e.target.files?.[0] ?? null)} />
          </label>
          {msg && <p className="alert bad" role="alert">{msg}</p>}
          <div className="acts">
            <button className="btn pri" disabled={busy} onClick={() => decide("approve")}>Approve</button>
            <button className="btn" style={{ color: "var(--bad)" }} disabled={busy} onClick={() => decide("reject")}>Reject</button>
          </div>
        </div>
      )}

      {(r.status === "Approved" || r.status === "Issued") && (
        <div className="card pad" style={{ marginBottom: 14, display: "grid", gap: 10 }}>
          <div className="sec-h" style={{ marginBottom: 0 }}>IT use only · issued devices</div>
          {r.items.map((i) => (
            <div key={i.id} style={{ display: "grid", gap: 4 }}>
              <div><b>{i.sr_no}. {i.employee_name}</b></div>
              {isStaff ? (
                <>
                  <div className="noprint"><ItIssue item={i} requestId={r.id} onDone={load} /></div>
                  {i.issued_on && <div className="fine">Asset tag / serial: <b>{i.asset_tag}</b> · issued {fmtDay(i.issued_on)}{i.issued_by_name ? ` · IT sign: ${i.issued_by_name}` : ""}</div>}
                </>
              ) : (
                <div className="fine">{i.issued_on ? <>Issued {fmtDay(i.issued_on)} · asset tag / serial: <b>{i.asset_tag}</b></> : "Waiting for IT to issue"}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card pad noprint">
        <div className="sec-h">Timeline</div>
        <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
          {r.events.map((e) => (
            <li key={e.id} style={{ fontSize: 13.5 }}>
              <b>{e.actor_name || "System"}</b> {e.action}{e.detail ? ` · ${e.detail}` : ""} <span className="fine">· {fmtDate(e.created_at)}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export default function DeviceRequestPage() {
  return (
    <AppShell>
      <View />
    </AppShell>
  );
}
