// Edit these lists any time — they drive the dropdowns in the app.

export const UNITS = ["Unit 1", "Unit 2", "Unit 3", "Unit 4", "Head Office"];

export const DEPARTMENTS = [
  "Foundry",
  "PPC",
  "Production",
  "Packing – Dispatch",
  "Accounts – Finance",
  "HR – Admin",
  "Quality",
  "Stores",
  "Maintenance",
  "Sales",
  "Purchase",
  "Audit / MIS",
  "Other",
];

export const TICKET_TYPES = ["IT", "ERP"] as const;

export const CATEGORIES: Record<string, string[]> = {
  IT: ["Hardware", "Network / Internet", "Software", "Email / Outlook", "Access / Password", "Printer / Scanner", "Other"],
  ERP: ["Bug / Error", "Report / MIS request", "Access request", "Data correction", "Training / How-to", "New requirement", "Other"],
};

export const ERP_MODULES = [
  "Sales",
  "Purchase",
  "Stores / Inventory",
  "PPC",
  "Production",
  "Foundry",
  "Packing – Dispatch",
  "Accounts – Finance",
  "HR / Payroll",
  "Reports / MIS",
  "Other",
];

export const PRIORITIES = ["Low", "Medium", "High", "Critical"] as const;
export const STATUSES = ["Open", "In Progress", "On Hold", "Resolved", "Closed"] as const;

export type Ticket = {
  id: string;
  ticket_no: number;
  type: "IT" | "ERP";
  category: string;
  priority: (typeof PRIORITIES)[number];
  status: (typeof STATUSES)[number];
  title: string;
  description: string;
  unit: string | null;
  department: string | null;
  erp_module: string | null;
  erp_screen: string | null;
  created_by: string;
  assigned_to: string | null;
  created_at: string;
  raised_on?: string | null; // the date picked when raised, YYYY-MM-DD
  closed_on?: string | null; // closing date (set when Resolved/Closed), YYYY-MM-DD
  updated_at: string;
  resolved_at: string | null;
  target_on?: string | null; // promised date, YYYY-MM-DD
  target_at?: string | null; // optional promised time, HH:MM (24 h)
  creator_name?: string | null;
  creator_email?: string | null;
  assignee_name?: string | null;
  assignee_phone?: string | null;
};

export type Profile = {
  id: string;
  login_id: string | null;
  email: string | null;
  full_name: string | null;
  role: "user" | "agent" | "admin";
  phone?: string | null;
  unit: string | null;
  department: string | null;
  active?: boolean;
  last_login?: string | null;
  source?: "local" | "erp";
  must_change_password?: boolean;
};

export type Issue = {
  id: string;
  issue_no: number;
  type: "IT" | "ERP";
  title: string;
  description: string;
  priority: (typeof PRIORITIES)[number];
  status: (typeof STATUSES)[number];
  erp_module: string | null;
  created_by: string;
  assigned_to: string | null;
  created_at: string;
  raised_on?: string | null; // the date picked when raised, YYYY-MM-DD
  closed_on?: string | null; // closing date (set when Resolved/Closed), YYYY-MM-DD
  updated_at: string;
  resolved_at: string | null;
  creator_name?: string | null;
  assignee_name?: string | null;
  ticket_count?: number;
};

export const statusPill: Record<string, string> = {
  Open: "info",
  "In Progress": "warn",
  "On Hold": "neutral",
  Resolved: "ok",
  Closed: "neutral",
};

export const priorityLevel: Record<string, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };

export function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "2026-11-12" -> "12 Nov 2026" (date only, no time-zone shifting). */
export function fmtDay(d: string | null | undefined) {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Today as YYYY-MM-DD in this browser's time zone. */
export function todayStr() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/** "17:30" -> "5:30 PM" */
export function fmtClock(t: string | null | undefined) {
  if (!t) return "";
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
}

/** "12 Nov 2026" or "12 Nov 2026, 5:30 PM" */
export const fmtDue = (on: string | null | undefined, at?: string | null) =>
  on ? fmtDay(on) + (at ? `, ${fmtClock(at)}` : "") : "";

/** Past its target date (or target time, when one is set) and still not resolved. */
export function isOverdue(targetOn: string | null | undefined, status: string, targetAt?: string | null) {
  if (!targetOn || ["Resolved", "Closed"].includes(status)) return false;
  const day = targetOn.slice(0, 10);
  const today = todayStr();
  if (day !== today) return day < today;
  if (!targetAt) return false;
  const n = new Date();
  return targetAt.slice(0, 5) < `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}
