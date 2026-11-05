"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Profile } from "@/lib/constants";
import Icon, { Logo } from "./Icon";
import ThemeToggle from "./ThemeToggle";

const Ctx = createContext<{ profile: Profile | null }>({ profile: null });
export const useProfile = () => useContext(Ctx).profile;

export default function AppShell({
  children,
  adminOnly = false,
  staffOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
  staffOnly?: boolean;
}) {
  const router = useRouter();
  const path = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    api<Profile>("/api/me")
      .then((p) => {
        if (p.must_change_password) return router.replace("/change-password");
        if (adminOnly && p.role !== "admin") return router.replace("/");
        if (staffOnly && p.role === "user") return router.replace("/");
        setProfile(p);
      })
      .catch(() => router.replace("/login"));
  }, [router, adminOnly, staffOnly]);

  if (!profile) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--fg-3)" }}>Loading…</div>
    );
  }

  const isAdmin = profile.role === "admin";
  const isStaff = profile.role !== "user";
  const items = [
    { href: "/", label: "My tickets", icon: "tickets" },
    { href: "/tickets/new", label: "New ticket", icon: "plus" },
    ...(isStaff ? [{ href: "/admin", label: isAdmin ? "All tickets" : "Support queue", icon: "inbox" }] : []),
    ...(isStaff ? [{ href: "/issues", label: "Issues", icon: "issues" }] : []),
    ...(isAdmin ? [{ href: "/admin/users", label: "Users", icon: "users" }] : []),
  ];
  const isOn = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  const initials = (profile.full_name || profile.login_id || profile.email || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Ctx.Provider value={{ profile }}>
      <div className="app">
        <aside className="side">
          <Link href="/" className="brand">
            <Logo size={34} />
            <div>
              <div className="bn">JM TicketDesk</div>
              <div className="bs">IT &amp; ERP support</div>
            </div>
          </Link>

          <nav className="sn">
            {items.map((i) => (
              <Link key={i.href} href={i.href} className={`ni ${isOn(i.href) ? "on" : ""}`}>
                <Icon name={i.icon} />
                {i.label}
              </Link>
            ))}
          </nav>

          <div className="sf">
            <div className="who">
              <b>{profile.full_name || profile.login_id || profile.email}</b>
              <span>
                {isAdmin ? "Admin" : isStaff ? "IT team" : "User"} · {profile.login_id || profile.email}
              </span>
            </div>
            <div className="row2">
              <ThemeToggle />
              <Link href="/change-password" className="ni" title="Change password">
                <Icon name="key" size={16} />
              </Link>
              <button className="ni" onClick={() => signOut({ callbackUrl: "/login" })}>
                <Icon name="logout" size={16} />
                Logout
              </button>
            </div>
          </div>
        </aside>

        <div className="mainwrap">
          <div className="mtop">
            <div className="mb">
              <Logo size={28} />
              <span>JM TicketDesk</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="av" title={profile.login_id || profile.email || ""}>
                {initials}
              </span>
              <ThemeToggle className="icon-top" />
              <button className="icon-top" onClick={() => signOut({ callbackUrl: "/login" })} aria-label="Logout">
                <Icon name="logout" size={18} />
              </button>
            </div>
          </div>
          <main className="main">{children}</main>
        </div>

        <nav className="tabbar" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map((i) => (
            <Link key={i.href} href={i.href} className={`tb ${isOn(i.href) ? "on" : ""}`}>
              <Icon name={i.icon} size={20} />
              {i.label.replace("My tickets", "Mine").replace("All tickets", "All")}
            </Link>
          ))}
        </nav>
      </div>
    </Ctx.Provider>
  );
}
