"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AppShell, { useProfile } from "@/components/AppShell";
import { api } from "@/lib/api";
import { DEPARTMENTS, todayStr, UNITS } from "@/lib/constants";
import { MAX_ITEMS, MOBILE_TYPES, SIM_OPTIONS } from "@/lib/device";

type Row = { employee_name: string; unit: string; department: string; designation: string; mobile_type: string; sim_required: string; laptop_pc: string; accessories: string; purpose: string };
type Approvers = { people: { id: string; full_name: string | null; login_id: string | null }[]; hr: string | null; mgmt: string | null };

function NewRequest() {
  const me = useProfile()!;
  const router = useRouter();
  const blank = (): Row => ({
    employee_name: "", unit: me.unit || "", department: me.department || "", designation: "",
    mobile_type: "N/A", sim_required: "N/A", laptop_pc: "", accessories: "", purpose: "",
  });
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [date, setDate] = useState(todayStr());
  const [dh, setDh] = useState("");
  const [ap, setAp] = useState<Approvers | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Approvers>("/api/device-requests/approvers").then(setAp).catch((e) => setError(e.message));
  }, []);

  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const name = (id: string | null) => ap?.people.find((p) => p.id === id)?.full_name || "not set";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await api<{ id: string }>("/api/device-requests", {
        method: "POST",
        body: JSON.stringify({ requirement_on: date, dept_head_id: dh, items: rows }),
      });
      router.replace(`/device-requests/${d.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 820 }}>
      <div className="ph">
        <div>
          <h1>New device request</h1>
          <p className="sub">Form IT/MOB/01 · Mobile & IT device requirement. Add one block for each employee who needs a device.</p>
        </div>
        <Link href="/device-requests" className="btn">Cancel</Link>
      </div>

      <div className="card pad form" style={{ marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          <label>Requirement date<input className="in" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label>
            Department Head (approves first)
            <select className="in sel" required value={dh} onChange={(e) => setDh(e.target.value)}>
              <option value="">Choose…</option>
              {ap?.people.filter((p) => p.id !== me.id).map((p) => <option key={p.id} value={p.id}>{p.full_name || p.login_id}</option>)}
            </select>
          </label>
        </div>
        {ap && (
          <p className="fine" style={{ margin: 0 }}>
            Then HR: <b>{name(ap.hr)}</b> · Management: <b>{name(ap.mgmt)}</b>
            {(!ap.hr || !ap.mgmt) && <span style={{ color: "var(--bad)" }}> — an admin must set these first.</span>}
          </p>
        )}
      </div>

      {rows.map((r, i) => (
        <div key={i} className="card pad form" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="sec-h" style={{ marginBottom: 0 }}>Employee {i + 1}</div>
            {rows.length > 1 && <button type="button" className="btn sm" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>Remove</button>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
            <label>Employee name<input className="in" required maxLength={150} value={r.employee_name} onChange={(e) => set(i, { employee_name: e.target.value })} /></label>
            <label>Designation<input className="in" maxLength={100} value={r.designation} onChange={(e) => set(i, { designation: e.target.value })} /></label>
            <label>
              Unit
              <select className="in sel" value={r.unit} onChange={(e) => set(i, { unit: e.target.value })}>
                <option value="">—</option>
                {UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </label>
            <label>
              Department
              <select className="in sel" value={r.department} onChange={(e) => set(i, { department: e.target.value })}>
                <option value="">—</option>
                {DEPARTMENTS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </label>
            <label>
              Mobile type
              <select className="in sel" value={r.mobile_type} onChange={(e) => set(i, { mobile_type: e.target.value })}>
                {MOBILE_TYPES.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
            <label>
              SIM required
              <select className="in sel" value={r.sim_required} onChange={(e) => set(i, { sim_required: e.target.value })}>
                {SIM_OPTIONS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
          </div>
          <label>Laptop / PC (type and specs, or leave blank)<input className="in" maxLength={300} value={r.laptop_pc} onChange={(e) => set(i, { laptop_pc: e.target.value })} /></label>
          <label>Accessories / other device (mouse, keyboard, etc.)<input className="in" maxLength={300} value={r.accessories} onChange={(e) => set(i, { accessories: e.target.value })} /></label>
          <label>Purpose / business justification<textarea className="in" required maxLength={500} value={r.purpose} onChange={(e) => set(i, { purpose: e.target.value })} /></label>
        </div>
      ))}

      <p className="fine">Leave a device as N/A (or blank) when it is not required. Each employee needs at least one device.</p>
      {error && <p className="alert bad" role="alert">{error}</p>}
      <div className="acts" style={{ justifyContent: "space-between", marginTop: 8 }}>
        <button type="button" className="btn" disabled={rows.length >= MAX_ITEMS} onClick={() => setRows((x) => [...x, blank()])}>+ Add employee ({rows.length}/{MAX_ITEMS})</button>
        <button className="btn pri" disabled={busy}>{busy ? "Submitting…" : "Submit for approval"}</button>
      </div>
    </form>
  );
}

export default function NewDeviceRequestPage() {
  return (
    <AppShell>
      <NewRequest />
    </AppShell>
  );
}
