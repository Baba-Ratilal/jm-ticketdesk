// Shared (browser + server): the kinds of master lists the admin can manage.
export const MASTER_KINDS = [
  { kind: "unit", label: "Units", one: "unit" },
  { kind: "department", label: "Departments", one: "department" },
  { kind: "designation", label: "Designations", one: "designation" },
  { kind: "it_category", label: "IT categories", one: "IT category" },
  { kind: "erp_category", label: "ERP categories", one: "ERP category" },
  { kind: "erp_module", label: "ERP modules", one: "ERP module" },
  { kind: "task_source", label: "Task sources", one: "task source" },
] as const;
export type MasterKind = (typeof MASTER_KINDS)[number]["kind"];
export type MasterLists = Record<MasterKind, string[]>;
export type MasterRow = { id: string; kind: MasterKind; value: string; sort_order: number; active: boolean };
