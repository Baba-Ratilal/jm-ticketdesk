"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import BulkBar from "@/components/BulkBar";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import { fmtDay, fmtDate, todayStr } from "@/lib/constants";
import { TASK_STATUSES, type PersonLite, type Task, type TaskEvent } from "@/lib/tasks";

type View = "mine" | "given" | "team" | "all";
type Data = { items: Task[]; people: PersonLite[]; team: PersonLite[]; isManager: boolean; isAdmin: boolean; me: string; sources: string[] };

const VIEW_LABEL: Record<View, string> = { mine: "My tasks", given: "Tasks I gave", team: "My team", all: "Everyone" };
const isOpen = (t: Task) => t.status === "Open" || t.status === "In Progress";

function Tasks() {
  const [view, setView] = useState<View>("mine");
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("active");
  const [fSource, setFSource] = useState("");
  const [fPerson, setFPerson] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [add, setAdd] = useState({ task: "", assigned_to: "", source: "", target_on: "" });
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState("");

  // open straight into a view / filter when linked from the Overview (?view=team&person=…&status=overdue)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const v = sp.get("view");
    if (v === "mine" || v === "given" || v === "team" || v === "all") setView(v);
    if (sp.get("person")) setFPerson(sp.get("person")!);
    if (sp.get("status")) setFStatus(sp.get("status")!);
  }, []);

  async function load() {
    try {
      const qs = new URLSearchParams({ view });
      if ((view === "team" || view === "all") && fPerson) qs.set("person", fPerson);
      setD(await api<Data>(`/api/tasks?${qs}`));
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [view, fPerson]);

  async function patch(t: Task, body: Record<string, unknown>) {
    try {
      await api(`/api/tasks/${t.id}`, { method: "PATCH", body: JSON.stringify(body) });
      await load();
      if (open === t.id) showHistory(t.id, true);
    } catch (e: any) {
      alert(e.message);
      load();
    }
  }
  async function showHistory(id: string, keep = false) {
    if (!keep && open === id) return setOpen(null);
    setOpen(id);
    try {
      setEvents((await api<{ events: TaskEvent[] }>(`/api/tasks/${id}`)).events);
    } catch {
      setEvents([]);
    }
  }
  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    setAddErr("");
    setAdding(true);
    try {
      await api("/api/tasks", { method: "POST", body: JSON.stringify(add) });
      setAdd({ task: "", assigned_to: add.assigned_to, source: add.source, target_on: "" }); // keep person + source for the next one
      await load();
    } catch (err: any) {
      setAddErr(err.message);
    } finally {
      setAdding(false);
    }
  }

  if (!d) return <p className="sub">{error || "Loading…"}</p>;
  const today = todayStr();
  const shown = d.items.filter((t) => {
    if (fStatus === "active" && !isOpen(t)) return false;
    if (fStatus === "overdue" && !(isOpen(t) && t.target_on && t.target_on < today)) return false;
    if (fStatus === "today" && !(isOpen(t) && t.target_on === today)) return false;
    if (fStatus === "notarget" && !(isOpen(t) && !t.target_on)) return false;
    if (["Open", "In Progress", "Done", "Not mine"].includes(fStatus) && t.status !== fStatus) return false;
    if (fSource && t.source !== fSource) return false;
    if (q && !`${t.task_no} ${t.task} ${t.assignee_name} ${t.assigner_name} ${t.remark ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const views: View[] = ["mine", "given", ...(d.isManager ? (["team"] as View[]) : []), ...(d.isAdmin ? (["all"] as View[]) : [])];

  return (
    <>
      <div className="ph">
        <div>
          <h1>Tasks</h1>
          <p className="sub">Give a task to anyone. The task itself is locked once given — the person it is for updates the status, target date and remark.</p>
        </div>
        <div className="segs" role="group" aria-label="Whose tasks">
          {views.map((v) => (
            <button key={v} className={`seg ${view === v ? "on" : ""}`} onClick={() => { setView(v); setFPerson(""); }}>{VIEW_LABEL[v]}</button>
          ))}
        </div>
      </div>

      <BulkBar kind="tasks" label="tasks" isAdmin={d.isAdmin} onImported={load} />

      <form className="card pad" onSubmit={addTask} style={{ marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,3fr) minmax(150px,1.3fr) minmax(130px,1fr) 150px auto", gap: 8, alignItems: "end" }} className="taskadd">
          <label className="lbl">New task
            <input className="in" required maxLength={1000} placeholder="What needs to be done?" value={add.task} onChange={(e) => setAdd({ ...add, task: e.target.value })} />
          </label>
          <label className="lbl">Give to
            <select className="in sel" required style={{ width: "100%" }} value={add.assigned_to} onChange={(e) => setAdd({ ...add, assigned_to: e.target.value })}>
              <option value="">Choose…</option>
              {d.people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === d.me ? " (me)" : ""}</option>)}
            </select>
          </label>
          <label className="lbl">Source
            <select className="in sel" style={{ width: "100%" }} value={add.source} onChange={(e) => setAdd({ ...add, source: e.target.value })}>
              <option value="">—</option>
              {d.sources.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="lbl">Target date
            <input className="in" type="date" min={today} value={add.target_on} onChange={(e) => setAdd({ ...add, target_on: e.target.value })} />
          </label>
          <button className="btn pri" disabled={adding}>{adding ? "Adding…" : "+ Add"}</button>
        </div>
        {addErr && <p className="alert bad" role="alert" style={{ marginTop: 8 }}>{addErr}</p>}
      </form>

      <div className="tools">
        <div className="search">
          <Icon name="search" size={16} />
          <input className="in" placeholder="Search task, person, remark…" aria-label="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="in sel" aria-label="Status" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="active">Open &amp; in progress</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="notarget">No target date</option>
          <option value="all">All statuses</option>
          {TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="in sel" aria-label="Source" value={fSource} onChange={(e) => setFSource(e.target.value)}>
          <option value="">Any source</option>
          {d.sources.map((s) => <option key={s}>{s}</option>)}
        </select>
        {(view === "team" || view === "all") && (
          <select className="in sel" aria-label="Person" value={fPerson} onChange={(e) => setFPerson(e.target.value)}>
            <option value="">{view === "team" ? "Whole team" : "Everyone"}</option>
            {(view === "team" ? d.team : d.people).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="card empty"><b>No tasks here</b><p>Add one above, or change the filters.</p></div>
      ) : (
        <div className="card tw">
          <table className="tbl stack" style={{ minWidth: 980 }}>
            <thead>
              <tr><th>#</th><th>Task</th><th>Given</th><th>For</th><th>By</th><th>Source</th><th>Target date</th><th>Status</th><th>Remark</th><th></th></tr>
            </thead>
            <tbody>
              {shown.map((t) => {
                const mine = t.assigned_to === d.me;
                const canStatus = mine || d.isAdmin;
                const canTarget = mine || d.isAdmin || t.assigned_by === d.me;
                const late = isOpen(t) && t.target_on && t.target_on < today;
                return (
                  <FragmentRow key={t.id}>
                    <tr style={t.status === "Done" ? { opacity: 0.6 } : undefined}>
                      <td className="mono meta" data-l="#">{t.task_no}</td>
                      <td className="first" style={{ minWidth: 240, maxWidth: 380, whiteSpace: "pre-wrap" }} data-l="Task">
                        <b style={{ fontWeight: 600 }}>{t.task}</b>
                        {t.status === "Not mine" && <span className="pill warn" style={{ marginLeft: 8 }}>Not mine</span>}
                      </td>
                      <td data-l="Given" className="meta" style={{ whiteSpace: "nowrap" }}>{fmtDay(t.given_on)}</td>
                      <td data-l="For">
                        {d.isAdmin ? (
                          <select className="in sel" style={{ padding: "5px 8px", minWidth: 130 }} aria-label={`Reassign task ${t.task_no}`} value={t.assigned_to}
                            onChange={(e) => confirm("Reassign this task?") ? patch(t, { assigned_to: e.target.value }) : load()}>
                            {d.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        ) : <span>{mine ? "Me" : t.assignee_name}</span>}
                      </td>
                      <td data-l="By">{t.assigned_by === d.me ? "Me" : t.assigner_name}</td>
                      <td data-l="Source">{t.source || <span className="meta">—</span>}</td>
                      <td data-l="Target date" style={{ whiteSpace: "nowrap" }}>
                        {t.history.length > 0 && (
                          <div className="meta" style={{ marginBottom: 2 }}>
                            {t.history.map((h, i) => h.from && <s key={i} style={{ marginRight: 6 }}>{fmtDay(h.from)}</s>)}
                          </div>
                        )}
                        {canTarget && t.status !== "Done" ? (
                          <input className="in" type="date" style={{ padding: "5px 8px", minWidth: 140, ...(late ? { borderColor: "var(--bad)" } : {}) }} aria-label={`Target date for task ${t.task_no}`}
                            defaultValue={t.target_on ?? ""} key={`${t.id}-${t.target_on}`}
                            onBlur={(e) => { if ((e.target.value || null) !== t.target_on) patch(t, { target_on: e.target.value || null }); }} />
                        ) : (
                          <span className={late ? "due late" : ""}>{t.target_on ? fmtDay(t.target_on) : "—"}</span>
                        )}
                      </td>
                      <td data-l="Status">
                        {canStatus ? (
                          <select className="in sel" style={{ padding: "5px 8px", minWidth: 118 }} aria-label={`Status of task ${t.task_no}`} value={t.status} onChange={(e) => patch(t, { status: e.target.value })}>
                            {TASK_STATUSES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        ) : <span className={`pill ${t.status === "Done" ? "ok" : t.status === "Not mine" ? "warn" : "info"}`}>{t.status}</span>}
                        {t.status === "Done" && t.done_on && <div className="meta">{fmtDay(t.done_on)}</div>}
                      </td>
                      <td data-l="Remark" style={{ minWidth: 190 }}>
                        {canStatus ? (
                          <input className="in" maxLength={1000} style={{ padding: "5px 8px" }} aria-label={`Remark for task ${t.task_no}`} placeholder="Add a remark…"
                            defaultValue={t.remark ?? ""} key={`${t.id}-${t.remark}`}
                            onBlur={(e) => { if (e.target.value.trim() !== (t.remark ?? "")) patch(t, { remark: e.target.value }); }} />
                        ) : <span style={{ whiteSpace: "pre-wrap" }}>{t.remark || <span className="meta">—</span>}</span>}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="btn sm" onClick={() => showHistory(t.id)}>{open === t.id ? "Hide" : "History"}</button>
                        {d.isAdmin && (
                          <>
                            {" "}
                            <button className="btn sm" onClick={() => { const v = prompt("Edit the task:", t.task); if (v && v.trim() && v.trim() !== t.task) patch(t, { task: v }); }}>Edit</button>
                            {" "}
                            <button className="btn sm danger" onClick={async () => {
                              if (!confirm(`Delete task #${t.task_no} permanently?`)) return;
                              try { await api(`/api/tasks/${t.id}`, { method: "DELETE" }); load(); } catch (e: any) { alert(e.message); }
                            }}>Delete</button>
                          </>
                        )}
                      </td>
                    </tr>
                    {open === t.id && (
                      <tr>
                        <td colSpan={10} style={{ background: "var(--surface-2)" }}>
                          {events.length === 0 ? <span className="meta">No changes yet.</span> : (
                            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                              {events.map((e) => (
                                <li key={e.id}>
                                  <span className="meta">{fmtDate(e.created_at)} · {e.actor_name || "System"} · </span>
                                  {e.kind === "created" && `Task given${e.new_value ? `, target ${fmtDay(e.new_value)}` : ""}`}
                                  {e.kind === "target" && `Target date ${e.old_value ? fmtDay(e.old_value) : "none"} → ${e.new_value ? fmtDay(e.new_value) : "none"}`}
                                  {e.kind === "status" && `Status ${e.old_value} → ${e.new_value}`}
                                  {e.kind === "remark" && `Remark: ${e.new_value || "(cleared)"}`}
                                  {e.kind === "edited" && `Edited by admin: ${e.new_value}`}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="fine" style={{ marginTop: 8 }}>
        Tick-free: pick a status from the dropdown. Marking a task <b>Not mine</b> flags it for the person who gave it and for managers — add the reason in the remark. Old target dates stay visible, struck through.
      </p>
    </>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export default function TasksPage() {
  return (
    <AppShell>
      <Tasks />
    </AppShell>
  );
}
