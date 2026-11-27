"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import { CATEGORIES, DEPARTMENTS, ERP_MODULES, UNITS } from "./constants";
import type { MasterLists } from "./master-kinds";

const FALLBACK: MasterLists = {
  unit: [...UNITS],
  department: [...DEPARTMENTS],
  designation: [],
  it_category: [...CATEGORIES.IT],
  erp_category: [...CATEGORIES.ERP],
  erp_module: [...ERP_MODULES],
  task_source: [],
};

/** The admin-managed dropdown lists (units, departments, ...). Shows the built-in lists until they load. */
export function useMasters(): MasterLists {
  const [lists, setLists] = useState<MasterLists>(FALLBACK);
  useEffect(() => {
    api<{ lists: MasterLists }>("/api/masters").then((d) => setLists(d.lists)).catch(() => {});
  }, []);
  return lists;
}
