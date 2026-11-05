// Create a local TicketDesk account (or change its password / role). Used for the very first admin,
// and for anyone who is not in the ERP. People from the ERP get their password from the ERP instead.
//
//   node --env-file=.env.local scripts/set-password.js <user-id> [--name "Full Name"] [--role admin|agent|user]
//
// Run it on the server, in the app folder. It asks for the password (nothing is shown while you type).

const readline = require("readline");
const { query, closePool } = require("../lib/dbcore");
const { hashPassword } = require("../lib/password");

function ask(prompt, hidden) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(prompt)) rl.output.write(s);
      };
    }
    rl.question(prompt, (a) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(a);
    });
  });
}

(async () => {
  const args = process.argv.slice(2);
  const loginId = (args.find((a) => !a.startsWith("--")) || "").trim().toLowerCase();
  const opt = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const role = opt("role");
  const name = opt("name");
  if (!loginId || (role && !["admin", "agent", "user"].includes(role))) {
    console.log('Usage: node --env-file=.env.local scripts/set-password.js <user-id> [--name "Full Name"] [--role admin|agent|user]');
    process.exit(1);
  }

  const [existing] = await query("SELECT id, source FROM dbo.users WHERE login_id=@l", { l: loginId });
  if (existing && existing.source === "erp") {
    console.log(`${loginId} comes from the ERP, so their password is the ERP password. Nothing changed.`);
    process.exit(1);
  }

  const p1 = await ask("New password: ", true);
  if (p1.length < 8) {
    console.log("The password must be at least 8 characters. Nothing changed.");
    process.exit(1);
  }
  const p2 = await ask("Type it again: ", true);
  if (p1 !== p2) {
    console.log("The two passwords differ. Nothing changed.");
    process.exit(1);
  }

  const hash = await hashPassword(p1);
  if (existing) {
    await query(
      `UPDATE dbo.users SET password_hash=@h, failed_attempts=0, locked_until=NULL, active=1,
              full_name = COALESCE(@name, full_name), role = COALESCE(@role, role) WHERE id=@id`,
      { h: hash, name: name ?? null, role: role ?? null, id: existing.id }
    );
    console.log(`Password changed for ${loginId}.`);
  } else {
    await query(
      `INSERT INTO dbo.users (login_id, full_name, role, source, password_hash) VALUES (@l, @name, @role, 'local', @h)`,
      { l: loginId, name: name ?? loginId, role: role ?? "user", h: hash }
    );
    console.log(`Created ${loginId} (${role ?? "user"}).`);
  }
  await closePool();
})().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
