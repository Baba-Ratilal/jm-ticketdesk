import { randomInt } from "crypto";

/** Rules for a new password. Returns a message when it is not acceptable, otherwise null. */
export function passwordProblem(pw: string, loginId?: string | null): string | null {
  if (pw.length < 8) return "Use at least 8 characters.";
  if (pw.length > 200) return "That password is too long.";
  if (loginId && pw.toLowerCase() === loginId.toLowerCase()) return "The password cannot be the same as the user ID.";
  return null;
}

/** A random temporary password that is easy to read out (no 0/O, 1/l/I). */
export function generatePassword(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[randomInt(chars.length)];
  return out;
}

export const LOGIN_ID_RE = /^[a-z0-9._@-]{1,100}$/;
