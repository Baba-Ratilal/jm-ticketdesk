import type { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { handle, HttpError } from "@/lib/http";
import { hashPassword, verifyPassword } from "@/lib/password";
import { passwordProblem } from "@/lib/policy";
import { requireUser } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Change your own password (also used for the forced change after an admin created or reset the account). */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const me = await requireUser(req, { allowPending: true });
    const body = await req.json().catch(() => ({}));
    const current = String(body.current ?? "");
    const next = String(body.next ?? "");

    const [u] = await query<{ password_hash: string | null; source: string }>(
      "SELECT password_hash, source FROM dbo.users WHERE id=@id",
      { id: me.id }
    );
    if (!u || u.source === "erp" || !u.password_hash)
      throw new HttpError(400, "This account signs in with its ERP password. Change it in the ERP.");

    if (!(await verifyPassword(current, u.password_hash))) {
      // count it like a failed sign-in, so a stolen session cannot be used to guess the password
      await query(
        `UPDATE dbo.users
            SET failed_attempts = CASE WHEN failed_attempts + 1 >= 5 THEN 0 ELSE failed_attempts + 1 END,
                locked_until    = CASE WHEN failed_attempts + 1 >= 5 THEN DATEADD(minute, 15, SYSUTCDATETIME()) ELSE locked_until END
          WHERE id=@id`,
        { id: me.id }
      );
      throw new HttpError(400, "Your current password is not right.");
    }
    const problem = passwordProblem(next, me.login_id);
    if (problem) throw new HttpError(400, problem);
    if (next === current) throw new HttpError(400, "Choose a password different from the current one.");

    await query(
      "UPDATE dbo.users SET password_hash=@h, must_change_password=0, failed_attempts=0, locked_until=NULL WHERE id=@id",
      { h: await hashPassword(next), id: me.id }
    );
    return { ok: true };
  });
}
