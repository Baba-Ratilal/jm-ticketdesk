"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import { MASTER_KINDS, type MasterKind, type MasterRow } from "@/lib/master-kinds";

function Masters() {
  const [rows, setRows] = useState<MasterRow[]>([]);
  const [kind, setKind] = useState<MasterKind>("unit");
  const [add, setAdd] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<{ unit: string | null; department: string | null; designation: string | null }[]>([]);

  async function load() {
    try {
      setRows((await api<{ rows: MasterRow[] }>("/api/masters?all=1")).rows);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
    api<{ users: any[] }>("/api/users").then((d) => setUsers(d.users)).catch(() => {});
  }, []);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true);
    try {
      await api(url, { method, body: body ? JSON.stringify(body) : undefined });
      await load();
      return true;
    } catch (e) {
      alert((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const meta = MASTER_KINDS.find((k) => k.kind === kind)!;
  const list = rows.filter((r) => r.kind === kind);
  const usedBy = (value: string) =>
    kind === "unit" ? users.filter((u) => u.unit === value).length
    : kind === "department" ? users.filter((u) => u.department === value).length
    : kind === "designation" ? users.filter((u) => u.designation === value).length
    : null;

  return (
    <>
      <div className="ph">
        <div>
          <h1>Masters</h1>
          <p className="sub">The lists behind the dropdowns. Changes apply to new tickets, issues, requests and users straight away.</p>
        </div>
        <Link href="/admin/users" className="btn">Users master →</Link>
      </div>

      <div className="tools" role="tablist" aria-label="Master lists" style={{ flexWrap: "wrap" }}>
        {MASTER_KINDS.map((k) => (
          <button key={k.kind} role="tab" aria-selected={kind === k.kind} className={`btn sm ${kind === k.kind ? "pri" : ""}`} onClick={() => setKind(k.kind)}>
            {k.label} <span className="fine" style={{ color: "inherit", opacity: 0.8 }}>({rows.filter((r) => r.kind === k.kind).length})</span>
          </button>
        ))}
      </div>

      {error ? (
        <div className="alert bad" role="alert">
          {error}. If this says the table does not exist, run <b>deploy\upgrade-masters.sql</b> in SSMS first.
        </div>
      ) : (
        <>
          <form
            className="card pad form"
            style={{ marginBottom: 14, display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}
            onSubmit={async (e) => {
              e.preventDefault();
              if (await call("/api/masters", "POST", { kind, value: add })) setAdd("");
            }}
          >
            <label style={{ flex: "1 1 260px" }}>
              Add {meta.one}
              <input className="in" required maxLength={100} value={add} onChange={(e) => setAdd(e.target.value)} />
            </label>
            <button className="btn pri" disabled={busy}>Add</button>
          </form>

          <div className="card tw">
            <table className="tbl stack">
              <thead>
                <tr><th style={{ width: 70 }}>Order</th><th>{meta.label.replace(/s$/, "")}</th>{usedBy("") !== null && <th>People</th>}<th>Status</th><th style={{ textAlign: "right" }}>Actions</th></tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr><td colSpan={5} className="meta">Nothing yet. Add the first one above.</td></tr>
                )}
                {list.map((r, i) => (
                  <tr key={r.id} style={r.active ? undefined : { opacity: 0.55 }}>
                    <td data-l="Order">
                      <div className="acts">
                        <button className="btn sm" aria-label={`Move ${r.value} up`} disabled={busy || i === 0} onClick={() => call(`/api/masters/${r.id}`, "PATCH", { move: "up" })}>↑</button>
                        <button className="btn sm" aria-label={`Move ${r.value} down`} disabled={busy || i === list.length - 1} onClick={() => call(`/api/masters/${r.id}`, "PATCH", { move: "down" })}>↓</button>
                      </div>
                    </td>
                    <td className="first" data-l={meta.one}><b>{r.value}</b></td>
                    {usedBy("") !== null && <td data-l="People">{usedBy(r.value)}</td>}
                    <td data-l="Status">{r.active ? <span className="pill ok">In use</span> : <span className="pill neutral">Switched off</span>}</td>
                    <td className="first" style={{ textAlign: "right" }}>
                      <div className="acts end">
                        <button
                          className="btn sm"
                          disabled={busy}
                          onClick={() => {
                            const v = prompt(`Rename "${r.value}" to:`, r.value);
                            if (v && v.trim() && v.trim() !== r.value) call(`/api/masters/${r.id}`, "PATCH", { value: v });
                          }}
                        >
                          Rename
                        </button>
                        <button className="btn sm" disabled={busy} onClick={() => call(`/api/masters/${r.id}`, "PATCH", { active: !r.active })}>
                          {r.active ? "Switch off" : "Switch on"}
                        </button>
                        <button
                          className="btn sm danger"
                          disabled={busy}
                          onClick={() => confirm(`Delete "${r.value}" from the list? Existing records keep the text they were saved with.`) && call(`/api/masters/${r.id}`, "DELETE")}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="fine" style={{ marginTop: 10 }}>
            Rename updates existing tickets, issues and users that use the old name. Switch off hides a value from new forms but keeps old records unchanged.
          </p>
        </>
      )}
    </>
  );
}

export default function MastersPage() {
  return (
    <AppShell adminOnly>
      <Masters />
    </AppShell>
  );
}
