import type { NextRequest } from "next/server";
import { isGuid, query } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { getMasterLists } from "@/lib/masters";
import { hashPassword } from "@/lib/password";
import { generatePassword, passwordProblem } from "@/lib/policy";
import { requireAdmin } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin only: set role (user / IT team / admin), phone number, or disable / enable an account. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const params = await ctx.params;
    await requireAdmin(req);
    if (!isGuid(params.id)) throw new HttpError(404, "User not found");
    const body = await req.json().catch(() => ({}));

    const [u] = await query<{ role: string; active: boolean; phone: string | null; source: string; login_id: string | null; email: string | null }>(
      "SELECT role, active, phone, source, login_id, email FROM dbo.users WHERE id=@id",
      { id: params.id }
    );
    if (!u) throw new HttpError(404, "User not found");

    // reset the password: a temporary one that must be changed at the next sign-in (shown once)
    if (body.reset_password) {
      if (u.source === "erp") throw new HttpError(400, "This account uses its ERP password. Reset it in the ERP.");
      const given = String(body.password ?? "");
      const password = given || generatePassword();
      if (given) {
        const problem = passwordProblem(given, u.login_id);
        if (problem) throw new HttpError(400, problem);
      }
      await query(
        "UPDATE dbo.users SET password_hash=@h, must_change_password=1, failed_attempts=0, locked_until=NULL WHERE id=@id",
        { h: await hashPassword(password), id: params.id }
      );
      return { ok: true, password };
    }

    const newRole = body.role ?? u.role;
    const newActive = body.active ?? u.active;
    if (!["user", "agent", "admin"].includes(newRole)) throw new HttpError(400, "Invalid role");
    if (typeof newActive !== "boolean") throw new HttpError(400, "Invalid value");
    let newPhone: string | null = u.phone;
    if (body.phone !== undefined) {
      const p = String(body.phone ?? "").trim();
      if (p && !/^[0-9+()\-\s]{6,20}$/.test(p)) throw new HttpError(400, "Enter a valid phone number");
      newPhone = p || null;
    }

    let newEmail: string | null = u.email;
    if (body.email !== undefined) {
      const e = String(body.email ?? "").trim().toLowerCase();
      if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, "Enter a valid email address");
      if (e) {
        const [dup] = await query("SELECT id FROM dbo.users WHERE email=@e AND id<>@id", { e, id: params.id });
        if (dup) throw new HttpError(409, "Another user already has that email");
      }
      newEmail = e || null;
    }

    // master details: name, unit, department, designation (values come from the Masters lists)
    const extra: string[] = [];
    const ep: Record<string, unknown> = {};
    if (body.full_name !== undefined) {
      const n = String(body.full_name).trim().replace(/\s+/g, " ").slice(0, 200);
      if (n.length < 2) throw new HttpError(400, "Enter the person's name");
      extra.push("full_name=@fn"); ep.fn = n;
    }
    if (body.unit !== undefined || body.department !== undefined || body.designation !== undefined) {
      const lists = await getMasterLists();
      for (const [field, list, what] of [["unit", lists.unit, "unit"], ["department", lists.department, "department"], ["designation", lists.designation, "designation"]] as const) {
        if (body[field] === undefined) continue;
        const v = String(body[field] ?? "").trim();
        if (v && !list.includes(v)) throw new HttpError(400, `Choose the ${what} from the list`);
        extra.push(`${field}=@${field}`); ep[field] = v || null;
      }
    }

    // who this person reports to (a manager sees everything below them)
    if (body.manager_id !== undefined) {
      const m = body.manager_id ? String(body.manager_id) : null;
      if (m) {
        if (!isGuid(m)) throw new HttpError(400, "Choose a manager");
        if (m === params.id) throw new HttpError(400, "A person cannot be their own manager");
        const [mu] = await query("SELECT id FROM dbo.users WHERE id=@id AND active=1", { id: m });
        if (!mu) throw new HttpError(400, "Choose an active manager");
        // refuse a loop: the new manager must not already report (directly or not) to this person
        const [loop] = await query<{ n: number }>(
          `;WITH up AS (SELECT id, manager_id FROM dbo.users WHERE id=@m UNION ALL SELECT u.id, u.manager_id FROM dbo.users u JOIN up ON u.id = up.manager_id)
           SELECT COUNT(*) AS n FROM up WHERE id=@me OPTION (MAXRECURSION 60)`, { m, me: params.id });
        if ((loop?.n ?? 0) > 0) throw new HttpError(400, "That would make a loop — that person already reports to this one");
      }
      extra.push("manager_id=@mgr"); ep.mgr = m;
    }

    // never leave the system without an active admin
    const losesAdmin = u.role === "admin" && u.active && (newRole !== "admin" || !newActive);
    if (losesAdmin) {
      const [{ n }] = await query<{ n: number }>(
        "SELECT COUNT(*) AS n FROM dbo.users WHERE role='admin' AND active=1 AND id<>@id",
        { id: params.id }
      );
      if (n < 1) throw new HttpError(400, "There must be at least one active admin");
    }

    await query(`UPDATE dbo.users SET role=@role, active=@active, phone=@phone, email=@email${extra.map((e) => ", " + e).join("")} WHERE id=@id`, {
      ...ep,
      phone: newPhone,
      email: newEmail,
      role: newRole,
      active: newActive ? 1 : 0,
      id: params.id,
    });
    return { ok: true };
  });
}
