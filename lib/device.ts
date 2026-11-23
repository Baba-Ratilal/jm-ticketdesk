// Shared (browser + server) definitions for the Mobile & IT Device Requirement form IT/MOB/01.

export const MOBILE_TYPES = ["N/A", "Android", "Non-Android"] as const;
export const SIM_OPTIONS = ["N/A", "Yes", "No"] as const;
export const MAX_ITEMS = 10;

/** Sign-off stages, in order. */
export const STAGES = [
  { stage: 1, label: "Department Head" },
  { stage: 2, label: "HR" },
  { stage: 3, label: "Management" },
] as const;

export const DR_STATUS_PILL: Record<string, string> = {
  "Pending Dept Head": "warn",
  "Pending HR": "warn",
  "Pending Management": "warn",
  Approved: "info",
  Issued: "ok",
  Rejected: "bad",
  Cancelled: "neutral",
};

export type DeviceItem = {
  id: string;
  sr_no: number;
  employee_name: string;
  unit: string | null;
  department: string | null;
  designation: string | null;
  mobile_type: string;
  sim_required: string;
  laptop_pc: string | null;
  accessories: string | null;
  purpose: string;
  asset_tag: string | null;
  issued_on: string | null;
  issued_by_name: string | null;
};

export type DeviceApproval = {
  stage: number;
  approver_id: string;
  approver_name: string | null;
  decision: "Approved" | "Rejected" | null;
  decided_by_name: string | null;
  decided_at: string | null;
  remark: string | null;
  proof_file_id: string | null; // image of the approval (signed form, WhatsApp approval…)
};

export type DeviceRequest = {
  id: string;
  req_no: number;
  requirement_on: string;
  status: string;
  requested_by: string;
  requester_name: string | null;
  created_at: string;
  items: DeviceItem[];
  approvals: DeviceApproval[];
  events: { id: string; action: string; detail: string | null; actor_name: string | null; created_at: string }[];
};

export type DeviceRow = {
  id: string;
  req_no: number;
  requirement_on: string;
  status: string;
  requester_name: string | null;
  items_count: number;
  names: string | null;
  cur_approver_id: string | null;
  cur_approver_name: string | null;
  cur_stage: number | null;
};

export const reqLabel = (n: number | string) => `DR-${String(n).padStart(4, "0")}`;
