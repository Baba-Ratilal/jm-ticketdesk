// Add many people at once from deploy/users-to-import.csv (login_id,full_name) as normal TicketDesk users.
// Everyone gets the same temporary password and MUST choose their own when they first sign in.
// Anyone whose user ID already exists is skipped (nothing about them is changed). Safe to run again.
//
//   node --env-file=.env.local scripts/import-users.js              (uses the default temporary password Admin@123)
//   node --env-file=.env.local scripts/import-users.js --password "Other@123"
//   node --env-file=.env.local scripts/import-users.js --dry        (shows what it would do, changes nothing)

const fs = require("fs");
const path = require("path");
const { query, closePool } = require("../lib/dbcore");
const { hashPassword } = require("../lib/password");

(async () => {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const pi = args.indexOf("--password");
  const password = pi >= 0 ? args[pi + 1] : "Admin@123";
  if (!password || password.length < 8) {
    console.log("The temporary password must be at least 8 characters. Nothing changed.");
    process.exit(1);
  }

  const file = path.join(__dirname, "..", "deploy", "users-to-import.csv");
  const rows = fs.readFileSync(file, "utf8").split(/\r?\n/).slice(1).filter(Boolean).map((l) => {
    const i = l.indexOf(",");
    return { login: l.slice(0, i).trim().toLowerCase(), name: l.slice(i + 1).trim() };
  });

  const existing = new Set((await query("SELECT login_id FROM dbo.users WHERE login_id IS NOT NULL")).map((u) => u.login_id));
  const hash = await hashPassword(password); // one salted hash is fine to share: each row still verifies on its own
  let added = 0, skipped = 0;
  for (const r of rows) {
    if (!/^[a-z0-9._@-]{1,100}$/.test(r.login) || r.login.includes("--")) {
      console.log(`Skipped ${r.login}: not a usable user ID`);
      skipped++;
      continue;
    }
    if (existing.has(r.login)) {
      console.log(`Skipped ${r.login}: already exists`);
      skipped++;
      continue;
    }
    if (!dry) {
      await query(
        `INSERT INTO dbo.users (login_id, full_name, role, active, source, password_hash, must_change_password)
         VALUES (@l, @n, 'user', 1, 'local', @h, 1)`,
        { l: r.login, n: r.name, h: hash }
      );
    }
    added++;
  }
  console.log(`${dry ? "Would add" : "Added"} ${added} user(s); skipped ${skipped}.`);
  await closePool();
})().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
