import { query } from "./db";

/** Who new tickets of each type go to automatically (a user id, or null = nobody). */
export type AutoAssign = { IT: string | null; ERP: string | null };

export async function getAutoAssign(): Promise<AutoAssign> {
  const rows = await query<{ k: string; v: string | null }>(
    "SELECT k, v FROM dbo.settings WHERE k IN ('auto_assign_it','auto_assign_erp')"
  );
  const get = (k: string) => rows.find((r) => r.k === k)?.v || null;
  return { IT: get("auto_assign_it"), ERP: get("auto_assign_erp") };
}

export async function setSetting(k: string, v: string | null) {
  await query(
    `MERGE dbo.settings AS t USING (SELECT @k AS k, @v AS v) AS s ON t.k = s.k
     WHEN MATCHED THEN UPDATE SET v = s.v, updated_at = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT (k, v) VALUES (s.k, s.v);`,
    { k, v }
  );
}
