"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";

type Check = { count: number; errors: string[] };

/** Export to Excel (staff) and bulk import from Excel (admin). */
export default function BulkBar({ kind, label, isAdmin, onImported }: { kind: "tickets" | "issues" | "mom" | "tasks" | "managers"; label: string; isAdmin: boolean; onImported: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function send(f: File, dry: boolean) {
    const fd = new FormData();
    fd.set("file", f);
    if (dry) fd.set("dry", "1");
    return api<Check>(`/api/bulk/${kind}`, { method: "POST", body: fd });
  }

  async function pick(f: File | null) {
    setMsg("");
    setCheck(null);
    setFile(f);
    if (!f) return;
    setBusy(true);
    try {
      setCheck(await send(f, true));
    } catch (e: any) {
      setMsg(e.message);
      setFile(null);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function confirmImport() {
    if (!file) return;
    setBusy(true);
    try {
      const r = await send(file, false);
      setMsg(`Imported ${r.count} ${label}.`);
      setFile(null);
      setCheck(null);
      onImported();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div className="acts" style={{ flexWrap: "wrap" }}>
        <a className="btn sm" href={`/api/bulk/${kind}`}>Export to Excel</a>
        {isAdmin && (
          <>
            <a className="btn sm" href={`/api/bulk/${kind}?template=1`}>Import template</a>
            <button className="btn sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Checking…" : "Import from Excel"}</button>
            <input ref={input} type="file" hidden accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </>
        )}
      </div>
      {msg && <p className={`alert ${msg.startsWith("Imported") ? "ok" : "bad"}`} role="status" style={{ marginTop: 8 }}>{msg}</p>}
      {check && (
        <div className="card pad" style={{ marginTop: 8 }}>
          {check.errors.length ? (
            <>
              <b>Nothing imported — fix these in the file and upload it again:</b>
              <ul style={{ margin: "8px 0 0 18px", fontSize: 13 }}>{check.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              <div className="acts" style={{ marginTop: 10 }}><button className="btn sm" onClick={() => { setCheck(null); setFile(null); }}>Close</button></div>
            </>
          ) : (
            <>
              <b>{check.count} {label} are ready to import from {file?.name}.</b>
              <div className="acts" style={{ marginTop: 10 }}>
                <button className="btn pri sm" disabled={busy} onClick={confirmImport}>{busy ? "Importing…" : `Import ${check.count}`}</button>
                <button className="btn sm" disabled={busy} onClick={() => { setCheck(null); setFile(null); }}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
