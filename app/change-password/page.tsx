"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { Logo } from "@/components/Icon";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/constants";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Profile>("/api/me").then(setMe).catch(() => router.replace("/login"));
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (next !== again) return setError("The two new passwords do not match.");
    setBusy(true);
    try {
      await api("/api/me/password", { method: "POST", body: JSON.stringify({ current, next }) });
      setDone(true);
      setTimeout(() => router.replace("/"), 1200);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  const forced = !!me?.must_change_password;

  return (
    <div className="loginwrap">
      <div className="logincard">
        <div className="loginhead">
          <Logo size={52} />
          <div>
            <h1>JM TicketDesk</h1>
            <p className="sub">{forced ? "Choose your own password to continue" : "Change your password"}</p>
          </div>
        </div>

        {!me ? (
          <p className="sub">Loading…</p>
        ) : me.source === "erp" ? (
          <div className="card pad form">
            <p>Your sign-in uses your ERP password, so it is changed in the ERP, not here.</p>
            <button className="btn" onClick={() => router.replace("/")}>Back</button>
          </div>
        ) : (
          <form className="card pad form" onSubmit={submit}>
            {forced && (
              <p className="pwnote">
                An administrator set a temporary password for you. Enter it below, then choose a new password that only you know.
              </p>
            )}
            {done && <p className="alert ok">Password changed. Taking you in…</p>}
            {error && <p className="alert bad">{error}</p>}

            <div>
              <label className="lbl" htmlFor="p_cur">{forced ? "Temporary password" : "Current password"}</label>
              <input className="in" id="p_cur" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
            </div>
            <div>
              <label className="lbl" htmlFor="p_new">New password</label>
              <input className="in" id="p_new" type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
              <p className="fine" style={{ marginTop: 4 }}>At least 8 characters.</p>
            </div>
            <div>
              <label className="lbl" htmlFor="p_again">New password again</label>
              <input className="in" id="p_again" type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
            </div>

            <button type="submit" disabled={busy || done} className="btn pri block" style={{ padding: "12px 14px" }}>
              {busy ? "Saving…" : "Save new password"}
            </button>
            {forced ? (
              <button type="button" className="btn block" onClick={() => signOut({ callbackUrl: "/login" })}>Sign out</button>
            ) : (
              <button type="button" className="btn block" onClick={() => router.replace("/")}>Cancel</button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
