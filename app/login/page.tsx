"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Logo } from "@/components/Icon";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // already signed in? go straight to the app
    api("/api/me").then(() => router.replace("/")).catch(() => {});
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await signIn("credentials", { loginId, password, redirect: false });
      if (res?.ok && !res.error) {
        router.replace("/");
        return;
      }
      setError(
        res?.error === "LOCKED"
          ? "Too many wrong attempts. This account is locked for 15 minutes — try again later or ask IT."
          : "Wrong user ID or password, or the account is disabled."
      );
    } catch {
      setError("Could not sign in. Please try again.");
    }
    setBusy(false);
  }

  return (
    <div className="loginwrap">
      <div className="logincard">
        <div className="loginhead">
          <Logo size={52} />
          <div>
            <h1>JM TicketDesk</h1>
            <p className="sub">IT &amp; ERP support — raise and track your tickets</p>
          </div>
        </div>

        <form className="card pad form" onSubmit={submit}>
          <div>
            <h2 style={{ fontSize: 18 }}>Sign in</h2>
            <p className="sub" style={{ marginTop: 4 }}>Use your ERP user ID and password.</p>
          </div>

          {error && <p className="alert bad">{error}</p>}

          <div>
            <label className="lbl" htmlFor="f_login">User ID</label>
            <input
              className="in"
              id="f_login"
              name="loginId"
              autoComplete="username"
              autoCapitalize="none"
              autoFocus
              required
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
            />
          </div>
          <div>
            <label className="lbl" htmlFor="f_pw">Password</label>
            <input
              className="in"
              id="f_pw"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" disabled={busy} className="btn pri block" style={{ padding: "12px 14px" }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
