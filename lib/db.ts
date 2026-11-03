import sql from "mssql";

declare global {
  // eslint-disable-next-line no-var
  var __ticketdeskPool: Promise<sql.ConnectionPool> | undefined;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isGuid = (v: unknown): v is string => typeof v === "string" && GUID.test(v);

function config(): sql.config {
  const instance = process.env.MSSQL_INSTANCE || undefined;
  return {
    server: process.env.MSSQL_SERVER || "localhost",
    database: process.env.MSSQL_DATABASE || "TicketDesk",
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    port: instance ? undefined : Number(process.env.MSSQL_PORT || 1433),
    options: {
      encrypt: process.env.MSSQL_ENCRYPT === "true",
      trustServerCertificate: process.env.MSSQL_TRUST_CERT !== "false",
      instanceName: instance,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
    requestTimeout: 30_000,
    connectionTimeout: 15_000,
  };
}

function getPool(): Promise<sql.ConnectionPool> {
  if (!global.__ticketdeskPool) {
    global.__ticketdeskPool = new sql.ConnectionPool(config())
      .connect()
      .catch((e) => {
        global.__ticketdeskPool = undefined; // retry on next request
        throw e;
      });
  }
  return global.__ticketdeskPool;
}

/**
 * Run a parameterised query. Always pass user input through `params`
 * (@name placeholders) — never build SQL text from user input.
 * GUID-looking strings are sent as uniqueidentifier; GUID columns come back lower-cased.
 */
export async function query<T = any>(text: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const pool = await getPool();
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) {
    if (isGuid(v)) req.input(k, sql.UniqueIdentifier, v);
    else req.input(k, v as any);
  }
  const res = await req.query(text);
  const rows = (res.recordset || []) as any[];
  for (const r of rows) {
    for (const key of Object.keys(r)) {
      const val = r[key];
      if (typeof val === "string" && GUID.test(val)) r[key] = val.toLowerCase();
    }
  }
  return rows as T[];
}
