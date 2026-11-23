"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell, { useProfile } from "@/components/AppShell";
import { api } from "@/lib/api";
import { fmtDay } from "@/lib/constants";
import { DR_STATUS_PILL, reqLabel, type DeviceRow } from "@/lib/device";

type People = { id: string; full_name: string | null; login_id: string | null };
type Approvers = { people: People[]; hr: string | null; mgmt: string | null; canEdit: boolean };

function List() {
  const me = useProfile()!;
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [ap, setAp] = useState<Approvers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [f, setF] = useState("active");

  async function load() {
    try {
      const d = await api<{ items: DeviceRow[] }>("/api/device-requests");
      setRows(d.items);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    api<Approvers>("/api/device-requests/approvers").then(setAp).catch(() => {});
  }, []);

  async function saveAp(field: "hr" | "mgmt", id: string) {
    try {
      await api("/api/device-requests/approvers", { method: "PUT", body: JSON.stringify({ [field]: id || null }) });
      setAp((a) => (a ? { ...a, [field]: id || null } : a));
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const needsMe = (r: DeviceRow) => r.cur_approver_id === me.id;
  const waiting = rows.filter(needsMe).length;
  const shown = rows.filter((r) => {
    if (f === "me") return needsMe(r);
    if (f === "active") return !["Issued", "Rejected", "Cancelled"].includes(r.status);
    if (f === "all") return true;
    return r.status === f;
  });
  const personSel = (field: "hr" | "mgmt") => (
    <select className="in sel" aria-label={field === "hr" ? "HR approver" : "Management approver"} value={ap?.[field] || ""} onChange={(e) => saveAp(field, e.target.value)}>
      <option value="">Not set</option>
      {ap?.people.map((p) => <option key={p.id} value={p.id}>{p.full_name || p.login_id}</option>)}
    </select>
  );

  return (
    <>
      <div className="ph">
        <div>
          <h1>Device requests</h1>
          <p className="sub">Mobile & IT device requirement form (IT/MOB/01): requested, approved by Department Head, HR and Management, then issued by IT.</p>
        </div>
        <Link href="/device-requests/new" className="btn pri">+ New request</Link>
      </div>

      {waiting > 0 && (
        <p className="alert ok" role="status" style={{ marginBottom: 12 }}>
          {waiting} request{waiting === 1 ? " is" : "s are"} waiting for your approval.{" "}
          <button className="btn sm" onClick={() => setF("me")}>Show</button>
        </p>
      )}

      {ap?.canEdit && (
        <div className="card pad form" style={{ marginBottom: 14 }}>
          <div className="sec-h" style={{ marginBottom: 0 }}>Approvers (admin)</div>
          <p className="fine" style={{ margin: 0 }}>The Department Head is picked by the requester. HR and Management are fixed here and used for every new request.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
            <label>HR approver{personSel("hr")}</label>
            <label>Management approver{personSel("mgmt")}</label>
          </div>
        </div>
      )}

      <div className="tools">
        <select className="in sel" aria-label="Filter" value={f} onChange={(e) => setF(e.target.value)}>
          <option value="active">In progress</option>
          <option value="me">Waiting for me</option>
          <option value="all">All</option>
          <option>Approved</option>
          <option>Issued</option>
          <option>Rejected</option>
          <option>Cancelled</option>
        </select>
      </div>

      {error ? (
        <p className="err" role="alert">{error}</p>
      ) : loading ? (
        <p className="sub">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="card empty"><b>No requests</b><p>Raise one with “New request”.</p></div>
      ) : (
        <div className="card tw">
          <table className="tbl stack">
            <thead><tr><th>No.</th><th>Date</th><th>Requested by</th><th>For</th><th>Status</th><th>Waiting for</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="mono meta" data-l="No."><Link href={`/device-requests/${r.id}`}>{reqLabel(r.req_no)}</Link></td>
                  <td data-l="Date" style={{ whiteSpace: "nowrap" }}>{fmtDay(r.requirement_on)}</td>
                  <td data-l="Requested by">{r.requester_name || "—"}</td>
                  <td className="first" data-l="For" style={{ maxWidth: 340 }}>
                    <Link href={`/device-requests/${r.id}`}>{r.names}</Link>
                    <div className="fine">{r.items_count} employee{r.items_count === 1 ? "" : "s"}</div>
                  </td>
                  <td data-l="Status"><span className={`pill ${DR_STATUS_PILL[r.status] || "neutral"}`}>{r.status}</span></td>
                  <td data-l="Waiting for" style={needsMe(r) ? { fontWeight: 650 } : undefined}>{r.cur_approver_name ? (needsMe(r) ? "You" : r.cur_approver_name) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function DeviceRequestsPage() {
  return (
    <AppShell>
      <List />
    </AppShell>
  );
}
