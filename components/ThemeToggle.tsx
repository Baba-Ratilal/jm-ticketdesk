"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";

type Mode = "auto" | "light" | "dark";
const NEXT: Record<Mode, Mode> = { auto: "light", light: "dark", dark: "auto" };
const ICON: Record<Mode, string> = { auto: "auto", light: "sun", dark: "moon" };

/** Cycles Auto → Light → Dark. The choice is remembered in this browser only. */
export default function ThemeToggle({ className = "ni" }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("auto");

  useEffect(() => {
    try {
      const t = localStorage.getItem("td-theme");
      if (t === "light" || t === "dark") setMode(t);
    } catch {
      /* storage blocked: stay on auto */
    }
  }, []);

  function click() {
    const m = NEXT[mode];
    setMode(m);
    const root = document.documentElement;
    if (m === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", m);
    try {
      if (m === "auto") localStorage.removeItem("td-theme");
      else localStorage.setItem("td-theme", m);
    } catch {
      /* ignore */
    }
  }

  return (
    <button type="button" className={className} onClick={click} title="Switch theme">
      <Icon name={ICON[mode]} size={16} />
      {mode === "auto" ? "Auto" : mode === "light" ? "Light" : "Dark"}
    </button>
  );
}
