// Nightly copy of the ERP's user list into TicketDesk (run by the "TicketDesk ERP sync" scheduled task at 12 AM).
//
//   node --env-file=.env.local scripts/erp-sync.js          copy for real
//   node --env-file=.env.local scripts/erp-sync.js --dry    show what WOULD change, change nothing
//
// What it does, per ERP user: create the TicketDesk account if it is new, or update name / email / unit /
// department / active flag / password. It never touches TicketDesk's role or phone number. Accounts that
// were copied from the ERP earlier and have disappeared from it are disabled (not deleted).

const fs = require("fs");
const path = require("path");
const { query, closePool } = require("../lib/dbcore");
const { hashPassword, verifyPassword } = require("../lib/password");

const DRY = process.argv.includes("--dry");
const log = (...a) => console.log(new Date().toISOString().replace("T", " ").slice(0, 19), ...a);

const need = (name) => {
  if (!process.env[name]) throw new Error(`${name} is not set in .env.local`);
  return process.env[name];
};

const truthy = (v) => ["1", "y", "yes", "true", "t", "a", "active"].includes(String(v ?? "").trim().toLowerCase());
const clean = (v, max) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

async function fetchErpUsers() {
  let oracledb;
  try {
    oracledb = require("oracledb");
  } catch (e) {
    throw new Error("The 'oracledb' package is missing — run 'npm ci' in the app folder. (" + e.message + ")");
  }
  const sqlFile = path.join(__dirname, "..", "deploy", "erp-sync.sql");
  if (!fs.existsSync(sqlFile)) throw new Error("deploy\\erp-sync.sql is missing — copy erp-sync.sample.sql and adapt it to the ERP's user table.");
  const sqlText = fs.readFileSync(sqlFile, "utf8").replace(/;\s*$/, "").trim();

  const conn = await oracledb.getConnection({
    user: need("ERP_ORA_USER"),
    password: need("ERP_ORA_PASSWORD"),
    connectString: need("ERP_ORA_CONNECT"), // host:port/service_name
  });
  try {
    const res = await conn.execute(sqlText, [], { outFormat: oracledb.OUT_FORMAT_OBJECT, fetchArraySize: 500 });
    return res.rows || [];
  } finally {
    await conn.close();
  }
}

(async () => {
  const mode = (process.env.ERP_SECRET_MODE || "").toLowerCase(); // plain | hash
  if (!["plain", "hash"].includes(mode)) throw new Error("ERP_SECRET_MODE must be 'plain' or 'hash' in .env.local");
  if (mode === "hash" && !process.env.ERP_PW_SCHEME) throw new Error("ERP_PW_SCHEME must be set when ERP_SECRET_MODE=hash");

  log(DRY ? "ERP sync (dry run — nothing will be changed)" : "ERP sync started");
  const raw = await fetchErpUsers();
  const erp = [];
  const seen = new Set();
  for (const r of raw) {
    const row = {};
    for (const [k, v] of Object.entries(r)) row[k.toUpperCase()] = v;
    const id = String(row.LOGIN_ID ?? "").trim().toLowerCase();
    if (!id || id.length > 100 || seen.has(id)) continue; // skip blanks and duplicates
    seen.add(id);
    erp.push({
      id,
      name: clean(row.FULL_NAME, 200),
      email: clean(row.EMAIL, 256)?.toLowerCase() ?? null,
      unit: clean(row.UNIT, 100),
      dept: clean(row.DEPARTMENT, 100),
      active: truthy(row.ACTIVE),
      secret: row.SECRET == null ? "" : String(row.SECRET),
    });
  }
  log(`ERP returned ${raw.length} rows, ${erp.length} usable users`);
  if (erp.length === 0) throw new Error("The ERP returned no users — stopping so nobody is disabled by mistake.");

  const existing = await query(
    "SELECT id, login_id, source, full_name, email, unit, department, active, password_hash, erp_secret FROM dbo.users WHERE login_id IS NOT NULL"
  );
  const byLogin = new Map(existing.map((u) => [u.login_id, u]));

  // Safety brake: if this run would disable many accounts, something is probably wrong with the ERP query.
  const erpAccounts = existing.filter((u) => u.source === "erp" && u.active);
  const vanished = erpAccounts.filter((u) => !seen.has(u.login_id));
  if (erpAccounts.length >= 10 && vanished.length > erpAccounts.length * 0.2 && process.env.ERP_SYNC_FORCE !== "1") {
    throw new Error(
      `${vanished.length} of ${erpAccounts.length} ERP accounts would be disabled — stopping. ` +
        "If that is right, run once with ERP_SYNC_FORCE=1."
    );
  }

  let added = 0, updated = 0, unchanged = 0, disabled = 0, skippedLocal = 0, pwChanged = 0;
  for (const u of erp) {
    const cur = byLogin.get(u.id);
    if (cur && cur.source === "local") {
      skippedLocal++;
      log(`skipped ${u.id}: a local TicketDesk account with this ID exists (remove it, or rename, to let the ERP one in)`);
      continue;
    }

    // work out the password columns
    let passwordHash = cur ? cur.password_hash : null;
    let erpSecret = cur ? cur.erp_secret : null;
    if (u.secret) {
      if (mode === "plain") {
        const same = passwordHash && (await verifyPassword(u.secret, passwordHash));
        if (!same) {
          passwordHash = await hashPassword(u.secret); // we keep only our own salted hash, never the readable password
          pwChanged++;
        }
        erpSecret = null;
      } else {
        if (erpSecret !== u.secret) pwChanged++;
        erpSecret = u.secret;
        passwordHash = null;
      }
    }

    const p = {
      login: u.id, name: u.name, email: u.email, unit: u.unit, dept: u.dept, active: u.active ? 1 : 0,
      hash: passwordHash, secret: erpSecret,
    };
    if (!cur) {
      added++;
      if (!DRY) {
        await query(
          `INSERT INTO dbo.users (login_id, full_name, email, unit, department, active, source, password_hash, erp_secret, erp_synced_at)
           VALUES (@login, @name, @email, @unit, @dept, @active, 'erp', @hash, @secret, SYSUTCDATETIME())`,
          p
        ).catch(async (e) => {
          if (!/UX_users_email/.test(e.message)) throw e;
          await query(
            `INSERT INTO dbo.users (login_id, full_name, unit, department, active, source, password_hash, erp_secret, erp_synced_at)
             VALUES (@login, @name, @unit, @dept, @active, 'erp', @hash, @secret, SYSUTCDATETIME())`,
            p
          );
          log(`${u.id}: email ${u.email} already belongs to someone else, left blank`);
        });
      }
      continue;
    }

    const changed =
      cur.full_name !== u.name || cur.email !== u.email || cur.unit !== u.unit || cur.department !== u.dept ||
      !!cur.active !== u.active || cur.password_hash !== passwordHash || cur.erp_secret !== erpSecret;
    if (!changed) {
      unchanged++;
      continue;
    }
    updated++;
    if (!DRY) {
      await query(
        `UPDATE dbo.users SET full_name=@name, email=@email, unit=@unit, department=@dept, active=@active,
                password_hash=@hash, erp_secret=@secret, erp_synced_at=SYSUTCDATETIME() WHERE login_id=@login`,
        p
      ).catch(async (e) => {
        if (!/UX_users_email/.test(e.message)) throw e;
        await query(
          `UPDATE dbo.users SET full_name=@name, unit=@unit, department=@dept, active=@active,
                  password_hash=@hash, erp_secret=@secret, erp_synced_at=SYSUTCDATETIME() WHERE login_id=@login`,
          p
        );
        log(`${u.id}: email ${u.email} already belongs to someone else, kept the old one`);
      });
    }
  }

  for (const u of vanished) {
    disabled++;
    if (!DRY) await query("UPDATE dbo.users SET active=0, erp_synced_at=SYSUTCDATETIME() WHERE id=@id", { id: u.id });
  }

  log(`done: ${added} added, ${updated} updated (${pwChanged} password changes), ${unchanged} unchanged, ${disabled} disabled, ${skippedLocal} skipped`);
  await closePool();
})().catch((e) => {
  log("ERP sync FAILED:", e.message);
  process.exit(1);
});
