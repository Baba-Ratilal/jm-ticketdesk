import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { hashPassword } from "@/lib/password";
import { generatePassword, LOGIN_ID_RE, passwordProblem } from "@/lib/policy";
import { getMasterLists } from "@/lib/masters";
import { requireAdmin } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin(req);
    const users = await query(
      "SELECT id, login_id, email, source, full_name, role, phone, unit, department, designation, manager_id, active, last_login, must_change_password FROM dbo.users ORDER BY full_name"
    );
    return { users };
  });
}

/**
 * Admin: create a user with a temporary password. They must choose their own at first sign-in.
 * Leave the password out to have one generated. It is returned once, here, and never stored in readable form.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    await requireAdmin(req);
    const b = await req.json().catch(() => ({}));
    const loginId = String(b.login_id ?? "").trim().toLowerCase();
    const fullName = String(b.full_name ?? "").trim().slice(0, 200);
    const role = b.role ?? "user";
    const phone = String(b.phone ?? "").trim();

    if (!LOGIN_ID_RE.test(loginId) || loginId.includes("--"))
      throw new HttpError(400, "User ID can use letters, numbers and . _ @ - only.");
    if (!fullName) throw new HttpError(400, "Enter the person's name.");
    if (!["user", "agent", "admin"].includes(role)) throw new HttpError(400, "Invalid role");
    if (phone && !/^[0-9+()\-\s]{6,20}$/.test(phone)) throw new HttpError(400, "Enter a valid phone number");

    const given = String(b.password ?? "");
    const password = given || generatePassword();
    if (given) {
      const problem = passwordProblem(given, loginId);
      if (problem) throw new HttpError(400, problem);
    }

    const lists = await getMasterLists();
    const pick = (v: unknown, list: string[], what: string) => {
      const s = String(v ?? "").trim();
      if (s && !list.includes(s)) throw new HttpError(400, `Choose the ${what} from the list`);
      return s || null;
    };
    const unit = pick(b.unit, lists.unit, "unit");
    const department = pick(b.department, lists.department, "department");
    const designation = pick(b.designation, lists.designation, "designation");

    const [dup] = await query("SELECT id FROM dbo.users WHERE login_id=@l", { l: loginId });
    if (dup) throw new HttpError(409, "That user ID already exists.");

    const [row] = await query<{ id: string }>(
      `INSERT INTO dbo.users (login_id, full_name, role, phone, unit, department, designation, source, password_hash, must_change_password)
       OUTPUT INSERTED.id
       VALUES (@l, @n, @r, @p, @u, @d, @g, 'local', @h, 1)`,
      { l: loginId, n: fullName, r: role, p: phone || null, u: unit, d: department, g: designation, h: await hashPassword(password) }
    );
    return { id: row.id, login_id: loginId, password };
  });
}
