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
  updated_at: string;
  resolved_at: string | null;
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
