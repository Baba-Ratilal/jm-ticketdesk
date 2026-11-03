"use client";

import { useEffect, useState } from "react";
import AppShell, { useProfile } from "@/components/AppShell";
import Icon from "@/components/Icon";
import { api } from "@/lib/api";
import { fmtDate, type Profile } from "@/lib/constants";

function Users() {
  const me = useProfile()!;
  const [users, setUsers] = useState<Profile[]>([]);
  const [q, setQ] = useState("");

  async function load() {
    const d = await api<{ users: Profile[] }>("/api/users");
    setUsers(d.users);
  }
  useEffect(() => {
    load();
  }, []);

  async function patch(u: Profile, body: { role?: string; active?: boolean; phone?: string }, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body: JSON.stringify(body) });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const shown = users.filter((u) => `${u.full_name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="ph">
        <div>
          <h1>Users</h1>
          <p className="sub">
            {users.length} people have signed in · IT-team members work on assigned tickets; admins manage everything. Add a phone number for each IT-team member so requesters can call them.
          </p>
        </div>
        <div className="search" style={{ flex: "0 1 280px" }}>
          <Icon name="search" size={16} />
          <input className="in" placeholder="Search name or email" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="card tw">
        <table className="tbl stack">
          <thead>
            <tr>
              <th>Name</th>
              <th>Unit / Dept</th>
              <th>Last sign-in</th>
              <th>Role</th>
              <th>Phone</th>
              <th style={{ textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.id} style={u.active === false ? { opacity: 0.55 } : undefined}>
                <td className="first">
                  <div className="nm">{u.full_name}</div>
                  <div className="meta">{u.email}</div>
                </td>
                <td data-l="Unit / Dept">{[u.unit, u.department].filter(Boolean).join(" · ") || "—"}</td>
                <td data-l="Last sign-in">{u.last_login ? fmtDate(u.last_login) : "—"}</td>
                <td data-l="Role">
                  <select
                    className="in sel"
                    aria-label={`Role for ${u.full_name || u.email}`}
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
                      aria-label={`Phone for ${u.full_name || u.email}`}
                      placeholder="+91 …"
                      defaultValue={u.phone || ""}
                      onBlur={(e) => {
                        if (e.target.value.trim() !== (u.phone || "")) patch(u, { phone: e.target.value.trim() });
                      }}
                    />
                  )}
                </td>
                <td className="first" style={{ textAlign: "right" }}>
                  <div className="acts end">
                    {u.id !== me.id &&
                      (u.active === false ? (
                        <button className="btn sm" onClick={() => patch(u, { active: true })}>
                          Enable
                        </button>
                      ) : (
                        <button
                          className="btn sm danger"
                          onClick={() => patch(u, { active: false }, `Disable ${u.full_name || u.email}? They won't be able to sign in.`)}
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
