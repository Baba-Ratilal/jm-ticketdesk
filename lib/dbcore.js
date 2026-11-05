// Database access shared by the web app (lib/db.ts) and the command-line scripts (scripts/*.js).
// Plain CommonJS on purpose, so scripts can run with just `node`.
//
// Two ways to sign in to SQL Server (MSSQL_AUTH in .env.local):
//   windows (default)  The app signs in as the Windows account it runs under — no SQL password anywhere.
//                      Needs the "msnodesqlv8" package and Microsoft's ODBC Driver for SQL Server.
//   sql                A SQL login (MSSQL_USER / MSSQL_PASSWORD) over TCP.

const path = require("path");
const { createRequire } = require("module");

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isGuid = (v) => typeof v === "string" && GUID.test(v);

const authMode = () => (process.env.MSSQL_AUTH || "windows").toLowerCase();

// Load the driver by name at run time, from the app folder's node_modules (keeps the bundler out of it).
const appRequire = createRequire(path.join(process.cwd(), "noop.js"));
let sql;
function driver() {
  if (sql) return sql;
  if (authMode() === "windows") {
    try {
      sql = appRequire("mssql/msnodesqlv8");
    } catch (e) {
      throw new Error(
        "Windows authentication needs the 'msnodesqlv8' package and the Microsoft ODBC Driver for SQL Server. " +
          "Run 'npm ci' on the server (as an administrator) and install the ODBC driver (see SETUP-ONPREM.md). Details: " +
          e.message
      );
    }
  } else {
    sql = appRequire("mssql");
  }
  return sql;
}

function config() {
  const database = process.env.MSSQL_DATABASE || "TicketDesk";
  const common = {
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    requestTimeout: 30000,
    connectionTimeout: 15000,
  };

  if (authMode() === "windows") {
    const odbc = process.env.MSSQL_ODBC_DRIVER || "ODBC Driver 18 for SQL Server";
    // "lpc:" = shared memory: a direct local channel to SQL Server on the same machine (no network, no TLS).
    // For a named instance use e.g. MSSQL_ODBC_SERVER=lpc:(local)\SQLEXPRESS
    const server = process.env.MSSQL_ODBC_SERVER || "lpc:(local)";
    return {
      ...common,
      connectionString:
        `Driver={${odbc}};Server=${server};Database=${database};` +
        `Trusted_Connection=Yes;Encrypt=No;TrustServerCertificate=Yes;`,
      options: { trustedConnection: true, useUTC: true },
    };
  }

  const instance = process.env.MSSQL_INSTANCE || undefined;
  return {
    ...common,
    server: process.env.MSSQL_SERVER || "localhost",
    database,
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    port: instance ? undefined : Number(process.env.MSSQL_PORT || 1433),
    options: {
      encrypt: process.env.MSSQL_ENCRYPT === "true",
      trustServerCertificate: process.env.MSSQL_TRUST_CERT !== "false",
      cryptoCredentialsDetails: { maxVersion: process.env.MSSQL_TLS_MAX || "TLSv1.2" },
      instanceName: instance,
    },
  };
}

function getPool() {
  if (!global.__ticketdeskPool) {
    const s = driver();
    global.__ticketdeskPool = new s.ConnectionPool(config()).connect().catch((e) => {
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
async function query(text, params = {}) {
  const s = driver();
  const pool = await getPool();
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) {
    if (isGuid(v)) req.input(k, s.UniqueIdentifier, v);
    else req.input(k, v);
  }
  const res = await req.query(text);
  const rows = res.recordset || [];
  for (const r of rows) {
    for (const key of Object.keys(r)) {
      const val = r[key];
      if (typeof val === "string" && GUID.test(val)) r[key] = val.toLowerCase();
    }
  }
  return rows;
}

async function closePool() {
  if (global.__ticketdeskPool) {
    const p = await global.__ticketdeskPool.catch(() => null);
    global.__ticketdeskPool = undefined;
    if (p) await p.close();
  }
}

module.exports = { isGuid, query, closePool, config, authMode };
