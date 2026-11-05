// Password hashing and checking. Plain CommonJS so the scripts (set-password, ERP sync) can use it too.
//
// Our own passwords are stored as   scrypt$N$r$p$salt$hash   (salted, slow on purpose, built into Node).
// Passwords copied from the ERP (when it only gives us a hash) are checked against the ERP's own scheme.

const crypto = require("crypto");

const N = 16384, R = 8, P = 1, KEYLEN = 64;

const scrypt = (plain, salt, n, r, p, len) =>
  new Promise((resolve, reject) =>
    crypto.scrypt(plain, salt, len, { N: n, r, p, maxmem: 128 * n * r * 2 }, (err, key) => (err ? reject(err) : resolve(key)))
  );

async function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(plain, salt, N, R, P, KEYLEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function verifyPassword(plain, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64");
  const key = await scrypt(plain, Buffer.from(salt, "base64"), Number(n), Number(r), Number(p), expected.length);
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

let dummy;
/** Spend the same time as a real check, so "unknown user" and "wrong password" take equally long. */
async function burnTime(plain) {
  dummy = dummy || (await hashPassword("not-a-real-password"));
  await verifyPassword(plain, dummy);
}

const eq = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * Check a password against a hash copied from the ERP.
 * scheme (ERP_PW_SCHEME in .env.local): md5 | sha1 | sha256 | sha512 — plain hash written in hex.
 * Anything else is refused until we add it. Returns false when the scheme is unknown.
 */
function verifyErpSecret(plain, scheme, stored) {
  const s = String(scheme || "").toLowerCase();
  if (!["md5", "sha1", "sha256", "sha512"].includes(s)) return false;
  const digest = crypto.createHash(s).update(plain, "utf8").digest("hex");
  return eq(digest, String(stored || "").trim().toLowerCase());
}

module.exports = { hashPassword, verifyPassword, verifyErpSecret, burnTime };
