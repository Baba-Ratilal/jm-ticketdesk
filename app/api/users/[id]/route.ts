import type { NextRequest } from "next/server";
import { isGuid, query } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
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

    // never leave the system without an active admin
    const losesAdmin = u.role === "admin" && u.active && (newRole !== "admin" || !newActive);
    if (losesAdmin) {
      const [{ n }] = await query<{ n: number }>(
        "SELECT COUNT(*) AS n FROM dbo.users WHERE role='admin' AND active=1 AND id<>@id",
        { id: params.id }
      );
      if (n < 1) throw new HttpError(400, "There must be at least one active admin");
    }

    await query("UPDATE dbo.users SET role=@role, active=@active, phone=@phone, email=@email WHERE id=@id", {
      phone: newPhone,
      email: newEmail,
      role: newRole,
      active: newActive ? 1 : 0,
      id: params.id,
    });
    return { ok: true };
  });
}
