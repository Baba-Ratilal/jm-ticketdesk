import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { isGuid, query } from "./db";
import { HttpError } from "./http";

export type DbUser = {
  id: string;
  login_id: string | null;
  email: string | null;
  full_name: string | null;
  role: "user" | "agent" | "admin";
  phone: string | null;
  unit: string | null;
  department: string | null;
  active: boolean;
};

/** Block cross-site form posts: the Origin header must match our own address. */
function checkOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || !process.env.NEXTAUTH_URL) return;
  if (origin !== new URL(process.env.NEXTAUTH_URL).origin) throw new HttpError(403, "Bad origin");
}

/** The signed-in user, read fresh from the database (so role changes apply immediately). */
export async function requireUser(req?: NextRequest): Promise<DbUser> {
  if (req && !["GET", "HEAD", "OPTIONS"].includes(req.method)) checkOrigin(req);
  const session = await getServerSession(authOptions);
  const uid = (session as any)?.uid;
  if (!isGuid(uid)) throw new HttpError(401, "Not signed in");
  const rows = await query<DbUser>(
    "SELECT id, login_id, email, full_name, role, phone, unit, department, active FROM dbo.users WHERE id=@id",
    { id: uid }
  );
  const u = rows[0];
  if (!u || !u.active) throw new HttpError(401, "Account not available");
  return u;
}

/** Admin or IT-team member. */
export const isStaff = (u: { role: string }) => u.role === "admin" || u.role === "agent";

export async function requireStaff(req?: NextRequest): Promise<DbUser> {
  const u = await requireUser(req);
  if (!isStaff(u)) throw new HttpError(403, "IT team only");
  return u;
}

export async function requireAdmin(req?: NextRequest): Promise<DbUser> {
  const u = await requireUser(req);
  if (u.role !== "admin") throw new HttpError(403, "Admins only");
  return u;
}

/**
 * Fetch a ticket the user is allowed to see. Users: their own. IT team: their own, tickets assigned to them,
 * and unassigned ones (so they can pick them up). Admins: everything. Others get a plain 404.
 */
export async function getVisibleTicket(id: string, me: DbUser) {
  if (!isGuid(id)) throw new HttpError(404, "Ticket not found");
  const rows = await query(
    `SELECT t.*, c.full_name AS creator_name, c.email AS creator_email, a.full_name AS assignee_name, a.phone AS assignee_phone
       FROM dbo.tickets t
       JOIN dbo.users c ON c.id = t.created_by
       LEFT JOIN dbo.users a ON a.id = t.assigned_to
      WHERE t.id = @id`,
    { id }
  );
  const t = rows[0];
  const mayView =
    me.role === "admin" ||
    t?.created_by === me.id ||
    (me.role === "agent" && (t?.assigned_to === me.id || t?.assigned_to === null));
  if (!t || !mayView) throw new HttpError(404, "Ticket not found");
  return t;
}

export async function logEvent(ticketId: string, actorId: string, action: string, detail?: string) {
  await query(
    "INSERT INTO dbo.ticket_events (ticket_id, actor_id, action, detail) VALUES (@t, @a, @action, @detail)",
    { t: ticketId, a: actorId, action, detail: detail ?? null }
  );
}
