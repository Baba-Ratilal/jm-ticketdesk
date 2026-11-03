"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell, { useProfile } from "@/components/AppShell";
import ScreenshotPicker from "@/components/ScreenshotPicker";
import { api } from "@/lib/api";
import { CATEGORIES, DEPARTMENTS, ERP_MODULES, PRIORITIES, UNITS } from "@/lib/constants";

function Form() {
  const router = useRouter();
  const profile = useProfile()!;
  const [type, setType] = useState<"IT" | "ERP">("IT");
  const [category, setCategory] = useState(CATEGORIES.IT[0]);
  const [priority, setPriority] = useState<string>("Medium");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState(profile.unit || "");
  const [department, setDepartment] = useState(profile.department || "");
  const [erpModule, setErpModule] = useState("");
  const [erpScreen, setErpScreen] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setCategory(CATEGORIES[type][0]);
  }, [type]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (description.trim().length < 5) return setError("Please describe the issue.");
    if (!unit || !department) return setError("Please select your unit and department.");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append(
        "data",
        JSON.stringify({
          type,
          category,
          priority,
          description,
          unit,
          department,
          erp_module: erpModule,
          erp_screen: erpScreen,
        })
      );
      files.forEach((f) => fd.append("files", f));
      const { id } = await api<{ id: string }>("/api/tickets", { method: "POST", body: fd });
      router.replace(`/tickets/${id}`);
    } catch (err: any) {
      setError(err.message || "Could not create the ticket");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ maxWidth: 780 }}>
      <div className="ph">
        <div>
          <h1>Raise a new ticket</h1>
          <p className="sub">Describe the problem and attach screenshots so we can fix it faster.</p>
        </div>
      </div>

      <div className="card pad form">
        <div>
          <label className="lbl">What is this about?</label>
          <div className="tiles">
            {(["IT", "ERP"] as const).map((t) => (
              <button type="button" key={t} onClick={() => setType(t)} className={`tile ${type === t ? "on" : ""}`}>
                <b>{t === "IT" ? "IT support" : "ERP support"}</b>
                <span>{t === "IT" ? "Computer, network, email, printer…" : "Lighthouse ERP, reports, access, data…"}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid2">
          <div className="fld">
            <label className="lbl" htmlFor="f_cat">Category</label>
            <select id="f_cat" className="in" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES[type].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label className="lbl" htmlFor="f_pri">Priority</label>
            <select id="f_pri" className="in" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label className="lbl" htmlFor="f_unit">Unit</label>
            <select id="f_unit" className="in" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">Select unit</option>
              {UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
          <div className="fld">
            <label className="lbl" htmlFor="f_dep">Department</label>
            <select id="f_dep" className="in" value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">Select department</option>
              {DEPARTMENTS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {type === "ERP" && (
          <div className="erpbox grid2">
            <div className="fld">
              <label className="lbl" htmlFor="f_mod">ERP module</label>
              <select id="f_mod" className="in" value={erpModule} onChange={(e) => setErpModule(e.target.value)}>
                <option value="">Select module</option>
                {ERP_MODULES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label className="lbl" htmlFor="f_scr">Screen / report name</label>
              <input
                id="f_scr"
                className="in"
                value={erpScreen}
                onChange={(e) => setErpScreen(e.target.value)}
                placeholder="e.g. Sales Invoice, Stock Ledger"
              />
            </div>
          </div>
        )}

        <div className="fld">
          <label className="lbl" htmlFor="f_desc">Describe the issue</label>
          <textarea
            id="f_desc"
            className="in"
            style={{ minHeight: 160 }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is the problem? What were you trying to do? Any error message? Start with one clear line, for example: Sales invoice will not save."
            maxLength={5000}
          />
        </div>

        <div className="fld">
          <label className="lbl">Screenshots</label>
          <ScreenshotPicker files={files} onChange={setFiles} />
        </div>

        {error && <p className="alert bad">{error}</p>}

        <div className="acts end">
          <button type="button" className="btn" onClick={() => router.back()}>
            Cancel
          </button>
          <button className="btn pri" disabled={busy}>
            {busy ? "Submitting…" : "Submit ticket"}
          </button>
        </div>
      </div>
    </form>
  );
}

export default function NewTicketPage() {
  return (
    <AppShell>
      <Form />
    </AppShell>
  );
}
