"use client";

import { useEffect, useState } from "react";
import AppShell, { useProfile } from "@/components/AppShell";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import { fmtDate, type Profile } from "@/lib/constants";
import { useMasters } from "@/lib/useMasters";

function Users() {
  const me = useProfile()!;
  const lists = useMasters();
  const [users, setUsers] = useState<Profile[]>([]);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ login_id: "", full_name: "", role: "user", phone: "", password: "", unit: "", department: "", designation: "" });
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState<{ IT: string | null; ERP: string | null; staff: { id: string; full_name: string | null; login_id: string | null }[] } | null>(null);
  const [secret, setSecret] = useState<{ who: string; loginId: string; password: string } | null>(null);

  async function load() {
    const d = await api<{ users: Profile[] }>("/api/users");
    setUsers(d.users);
  }
  useEffect(() => {
    load();
    api<any>("/api/settings/auto-assign").then(setAuto).catch(() => {});
  }, []);

  async function saveAuto(type: "IT" | "ERP", id: string) {
    try {
      await api("/api/settings/auto-assign", { method: "PUT", body: JSON.stringify({ [type]: id || null }) });
      setAuto((a) => (a ? { ...a, [type]: id || null } : a));
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function patch(u: Profile, body: { role?: string; active?: boolean; phone?: string; email?: string; full_name?: string; unit?: string; department?: string; designation?: string }, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body: JSON.stringify(body) });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setBusy(true);
    try {
      const r = await api<{ login_id: string; password: string }>("/api/users", { method: "POST", body: JSON.stringify(form) });
      setSecret({ who: form.full_name, loginId: r.login_id, password: r.password });
      setForm({ login_id: "", full_name: "", role: "user", phone: "", password: "", unit: "", department: "", designation: "" });
      setAdding(false);
      load();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(u: Profile) {
    if (!confirm(`Reset the password for ${u.full_name || u.login_id}? A new temporary password will be made and they must change it at next sign-in.`)) return;
    try {
      const r = await api<{ password: string }>(`/api/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ reset_password: true }) });
      setSecret({ who: u.full_name || u.login_id || "", loginId: u.login_id || "", password: r.password });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const shown = users.filter((u) => `${u.full_name} ${u.login_id} ${u.email}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="ph">
        <div>
          <h1>Users</h1>
          <p className="sub">
            {users.length} people · <a href="/admin/masters">Manage units, departments &amp; other lists</a> · IT-team members work on assigned tickets; admins manage everything. Add a phone number for each IT-team member so requesters can call them.
          </p>
        </div>
        <button className="btn pri" onClick={() => { setAdding(!adding); setFormError(""); }}>
          {adding ? "Cancel" : "+ Add user"}
        </button>
        <div className="search" style={{ flex: "0 1 280px" }}>
          <Icon name="search" size={16} />
          <input className="in" placeholder="Search name or user ID" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {auto && (
        <div className="card pad form" style={{ marginBottom: 14 }}>
          <div className="sec-h" style={{ marginBottom: 0 }}>New tickets are assigned automatically to</div>
          <div className="grid2">
            {(["IT", "ERP"] as const).map((type) => (
              <div key={type}>
                <label className="lbl" htmlFor={`aa_${type}`}>{type} tickets</label>
                <select id={`aa_${type}`} className="in sel" value={auto[type] || ""} onChange={(e) => saveAuto(type, e.target.value)}>
                  <option value="">Nobody (stays in the queue)</option>
                  {auto.staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name || s.login_id}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="fine">Admins can still reassign any ticket from the ticket page or the queue. Only IT-team members and admins appear here.</p>
        </div>
      )}

      {secret && (
        <div className="card pad form" style={{ marginBottom: 14 }}>
          <div className="sec-h" style={{ marginBottom: 0 }}>Temporary password for {secret.who}</div>
          <p>
            User ID <b className="mono">{secret.loginId}</b> — give them this password. It is shown <b>only now</b>; they will be asked to choose their own the first time they sign in.
          </p>
          <div className="secret">{secret.password}</div>
          <div className="acts">
            <button className="btn sm" onClick={() => navigator.clipboard?.writeText(secret.password)}>Copy</button>
            <button className="btn sm" onClick={() => setSecret(null)}>Done, hide it</button>
          </div>
        </div>
      )}

      {adding && (
        <form className="card pad form" style={{ marginBottom: 14 }} onSubmit={createUser}>
          <div className="sec-h" style={{ marginBottom: 0 }}>New user</div>
          {formError && <p className="alert bad">{formError}</p>}
          <div className="grid2">
            <div>
              <label className="lbl" htmlFor="n_id">User ID</label>
              <input className="in" id="n_id" required autoCapitalize="none" placeholder="e.g. ru005" value={form.login_id} onChange={(e) => setForm({ ...form, login_id: e.target.value })} />
            </div>
            <div>
              <label className="lbl" htmlFor="n_name">Full name</label>
              <input className="in" id="n_name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div>
              <label className="lbl" htmlFor="n_role">Role</label>
              <select className="in sel" id="n_role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="user">User</option>
                <option value="agent">IT team</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="n_phone">Phone (optional)</label>
              <input className="in" id="n_phone" placeholder="+91 …" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="lbl" htmlFor="n_unit">Unit</label>
              <select className="in sel" id="n_unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                <option value="">—</option>
                {lists.unit.map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="n_department">Department</label>
              <select className="in sel" id="n_department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                <option value="">—</option>
                {lists.department.map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl" htmlFor="n_designation">Designation</label>
              <select className="in sel" id="n_designation" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })}>
                <option value="">—</option>
                {lists.designation.map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="lbl" htmlFor="n_pw">Default password</label>
            <input className="in" id="n_pw" type="text" autoComplete="off" minLength={8} placeholder="Leave empty to generate one" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <p className="fine" style={{ marginTop: 4 }}>They must replace it with their own password when they first sign in.</p>
          </div>
          <div className="acts">
            <button className="btn pri" disabled={busy}>{busy ? "Creating…" : "Create user"}</button>
          </div>
        </form>
      )}

      <div className="card tw">
        <table className="tbl stack">
          <thead>
            <tr>
              <th>Name</th>
              <th>Unit / Dept / Designation</th>
              <th>Last sign-in</th>
              <th>Role</th>
              <th>Phone</th>
              <th>Email (for daily digest)</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id} style={u.active === false ? { opacity: 0.55 } : undefined}>
                <td className="first">
                  <div className="nm">{u.full_name}{u.designation ? <span className="meta"> · {u.designation}</span> : null}</div>
                  <div className="meta">
                    {[u.login_id, u.email].filter(Boolean).join(" · ")}
                    {u.source === "erp" && " · ERP"}
                    {u.must_change_password && <span className="pill warn" style={{ marginLeft: 6 }}>must change password</span>}
                  </div>
                </td>
                <td data-l="Unit / Dept">
                  <div style={{ display: "grid", gap: 4, minWidth: 150 }}>
                    {([["unit", "Unit", lists.unit], ["department", "Department", lists.department], ["designation", "Designation", lists.designation]] as const).map(([k, l, opts]) => {
                      const cur = (u as any)[k] as string | null;
                      return (
                        <select key={k} className="in sel" style={{ padding: "5px 8px" }} aria-label={`${l} for ${u.full_name || u.login_id}`} value={cur || ""} onChange={(e) => e.target.value && patch(u, { [k]: e.target.value })}>
                          <option value="">{l}: —</option>
                          {cur && !opts.includes(cur) && <option>{cur}</option>}
                          {opts.map((x) => <option key={x}>{x}</option>)}
                        </select>
                      );
                    })}
                  </div>
                </td>
                <td data-l="Last sign-in">{u.last_login ? fmtDate(u.last_login) : "—"}</td>
                <td data-l="Role">
                  <select
                    className="in sel"
                    aria-label={`Role for ${u.full_name || u.login_id || u.email}`}
                    style={{ padding: "6px 9px", minWidth: 120 }}
                    value={u.role}
                    onChange={(e) =>
                      patch(u, { role: e.target.value }, u.id === me.id && e.target.value !== "admin" ? "Remove your own admin access?" : undefined)
                    }
                  >
                    <option value="user">User</option>
                    <option value="agent">IT team</option>
                    <option value="admin">Admin</option>
                  </select>
                  {u.active === false && <span className="pill bad" style={{ marginLeft: 6 }}>disabled</span>}
                </td>
                <td data-l="Phone">
                  {u.role === "user" ? (
                    <span className="meta">{u.phone || "—"}</span>
                  ) : (
                    <input
                      className="in"
                      style={{ padding: "6px 9px", minWidth: 130 }}
                      aria-label={`Phone for ${u.full_name || u.login_id || u.email}`}
                      placeholder="+91 …"
                      defaultValue={u.phone || ""}
                      onBlur={(e) => {
                        if (e.target.value.trim() !== (u.phone || "")) patch(u, { phone: e.target.value.trim() });
                      }}
                    />
                  )}
                </td>
                <td data-l="Email">
                  {u.role === "user" ? (
                    <span className="meta">{u.email || "—"}</span>
                  ) : (
                    <input
                      className="in"
                      type="email"
                      style={{ padding: "6px 9px", minWidth: 190 }}
                      aria-label={`Email for ${u.full_name || u.login_id}`}
                      placeholder="name@company.com"
                      defaultValue={u.email || ""}
                      onBlur={(e) => {
                        if (e.target.value.trim().toLowerCase() !== (u.email || "")) patch(u, { email: e.target.value.trim() });
                      }}
                    />
                  )}
                </td>
                <td className="first" style={{ textAlign: "right" }}>
                  <div className="acts end">
                    <button
                      className="btn sm"
                      onClick={() => {
                        const v = prompt("Full name:", u.full_name || "");
                        if (v && v.trim() && v.trim() !== u.full_name) patch(u, { full_name: v.trim() });
                      }}
                    >
                      Edit name
                    </button>
                    {u.source !== "erp" && (
                      <button className="btn sm" onClick={() => resetPassword(u)}>
                        Reset password
                      </button>
                    )}
                    {u.id !== me.id &&
                      (u.active === false ? (
                        <button className="btn sm" onClick={() => patch(u, { active: true })}>
                          Enable
                        </button>
                      ) : (
                        <button
                          className="btn sm danger"
                          onClick={() => patch(u, { active: false }, `Disable ${u.full_name || u.login_id || u.email}? They won't be able to sign in.`)}
                        >
                          Disable
                        </button>
                      ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function UsersPage() {
  return (
    <AppShell adminOnly>
      <Users />
    </AppShell>
  );
}
