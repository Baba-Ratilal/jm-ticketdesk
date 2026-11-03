"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Logo } from "@/components/Icon";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // already signed in? go straight to the app
    api("/api/me").then(() => router.replace("/")).catch(() => {});
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) {
      setError(
        code === "AccessDenied"
          ? "This account can't use TicketDesk. Please sign in with your company Microsoft account (@jmaluminium.com or @jmaluminium.in), or ask IT if your account was disabled."
          : "Sign-in failed. Please try again."
      );
    }
  }, [router]);

  function go() {
    setBusy(true);
    signIn("azure-ad", { callbackUrl: "/" });
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

        <div className="card pad form">
          <div>
            <h2 style={{ fontSize: 18 }}>Sign in</h2>
            <p className="sub" style={{ marginTop: 4 }}>
              Use the same Microsoft account you use for your company email.
            </p>
          </div>

          {error && <p className="alert bad">{error}</p>}

          <button onClick={go} disabled={busy} className="btn block" style={{ padding: "12px 14px" }}>
            <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            {busy ? "Redirecting to Microsoft…" : "Sign in with Microsoft"}
          </button>
        </div>
      </div>
    </div>
  );
}
