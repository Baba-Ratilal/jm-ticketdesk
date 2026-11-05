"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import AppShell, { useProfile } from "@/components/AppShell";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import { ERP_MODULES, PRIORITIES, type Ticket } from "@/lib/constants";

type Staff = { id: string; full_name: string | null; login_id: string | null };

function NewIssue() {
  const router = useRouter();
  const me = useProfile()!;
  const ticketId = useSearchParams().get("ticket");
  const [staff, setStaff] = useState<Staff[]>([]);
  const [f, setF] = useState({ type: "IT", title: "", description: "", priority: "Medium", erp_module: "", assigned_to: "" });
  const [fromTicket, setFromTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ staff: Staff[] }>("/api/issues").then((d) => setStaff(d.staff)).catch(() => {});
    if (ticketId) {
      api<{ ticket: Ticket }>(`/api/tickets/${ticketId}`)
        .then(({ ticket: t }) => {
          setFromTicket(t);
          setF((x) => ({ ...x, type: t.type, title: t.title.slice(0, 150), description: t.description, priority: t.priority, erp_module: t.erp_module || "" }));
        })
        .catch(() => {});
    }
  }, [ticketId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await api<{ id: string }>("/api/issues", {
        method: "POST",
        body: JSON.stringify({ ...f, assigned_to: f.assigned_to || null, ticket_id: fromTicket?.id }),
      });
      router.push(`/issues/${r.id}`);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <Link href="/issues" className="btn sm" style={{ marginBottom: 14 }}><Icon name="back" size={14} /> Back</Link>
      <div className="ph">
        <div>
          <h1>New issue</h1>
          <p className="sub">{fromTicket ? `Ticket #${fromTicket.ticket_no} will be linked to this issue.` : "Track a problem or project for the IT team. You can link tickets afterwards."}</p>
        </div>
      </div>

      <form className="card pad form" style={{ maxWidth: 720 }} onSubmit={submit}>
        {error && <p className="alert bad">{error}</p>}
        <div className="grid2">
          <div>
            <label className="lbl" htmlFor="i_type">Type</label>
            <select id="i_type" className="in sel" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="IT">IT</option>
              <option value="ERP">ERP</option>
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="i_pr">Priority</label>
            <select id="i_pr" className="in sel" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          {f.type === "ERP" && (
            <div>
              <label className="lbl" htmlFor="i_mod">ERP module</label>
              <select id="i_mod" className="in sel" value={f.erp_module} onChange={(e) => setF({ ...f, erp_module: e.target.value })}>
                <option value="">—</option>
                {ERP_MODULES.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="lbl" htmlFor="i_own">Owner</label>
            <select id="i_own" className="in sel" value={f.assigned_to} onChange={(e) => setF({ ...f, assigned_to: e.target.value })}>
              <option value="">No owner yet</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.login_id}{s.id === me.id ? " (me)" : ""}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="lbl" htmlFor="i_title">Title</label>
          <input id="i_title" className="in" required maxLength={150} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. GRN posting fails for Unit 2 stores" />
        </div>
        <div>
          <label className="lbl" htmlFor="i_desc">Details</label>
          <textarea id="i_desc" className="in" maxLength={5000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="What is wrong, what you know so far, next steps…" />
        </div>
        <div className="acts">
          <button className="btn pri" disabled={busy}>{busy ? "Saving…" : "Create issue"}</button>
        </div>
      </form>
    </>
  );
}

export default function NewIssuePage() {
  return (
    <AppShell staffOnly>
      <Suspense fallback={<p className="sub">Loading…</p>}>
        <NewIssue />
      </Suspense>
    </AppShell>
  );
}
