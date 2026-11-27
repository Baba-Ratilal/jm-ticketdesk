import { CATEGORIES, DEPARTMENTS, ERP_MODULES, UNITS } from "./constants";
import { query } from "./db";
import type { MasterKind, MasterLists, MasterRow } from "./master-kinds";

/** The lists that were built into the app: used until the masters table exists. */
export const DEFAULT_LISTS: MasterLists = {
  unit: [...UNITS],
  department: [...DEPARTMENTS],
  designation: [],
  it_category: [...CATEGORIES.IT],
  erp_category: [...CATEGORIES.ERP],
  erp_module: [...ERP_MODULES],
  task_source: ["QBR", "MBR", "Annual Business Review", "Weekly Review", "Daily Review (LHS)", "Management Meeting", "Audit", "Other"],
};

/** Active values of every list, in the admin's order. Falls back to the built-in lists if the table is missing. */
export async function getMasterLists(): Promise<MasterLists> {
  try {
    const rows = await query<MasterRow>("SELECT kind, value FROM dbo.masters WHERE active=1 ORDER BY kind, sort_order, value");
    const out: MasterLists = { unit: [], department: [], designation: [], it_category: [], erp_category: [], erp_module: [], task_source: [] };
    for (const r of rows) out[r.kind]?.push(r.value);
    return out;
  } catch {
    return DEFAULT_LISTS;
  }
}

export async function getMasterList(kind: MasterKind): Promise<string[]> {
  return (await getMasterLists())[kind];
}
