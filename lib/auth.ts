import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { query } from "./db";
import { burnTime, verifyErpSecret, verifyPassword } from "./password";

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** User IDs that become admins when they sign in (so there is someone to set everyone else up). */
const bootstrapAdmins = () => list(process.env.INITIAL_ADMIN_IDS);

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

type Row = {
  id: string;
  full_name: string | null;
  active: boolean;
  password_hash: string | null;
  erp_secret: string | null;
  failed_attempts: number;
  locked: number; // 1 while the account is temporarily locked
};

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "User ID",
      credentials: { loginId: { type: "text" }, password: { type: "password" } },
      async authorize(creds) {
        const loginId = String(creds?.loginId ?? "").trim().toLowerCase();
        const password = String(creds?.password ?? "");
        if (!loginId || !password || loginId.length > 100 || password.length > 200) return null;

        const [u] = await query<Row>(
          `SELECT id, full_name, active, password_hash, erp_secret, failed_attempts,
                  CASE WHEN locked_until IS NOT NULL AND locked_until > SYSUTCDATETIME() THEN 1 ELSE 0 END AS locked
             FROM dbo.users WHERE login_id = @login`,
          { login: loginId }
        );

        if (!u) {
          await burnTime(password); // same delay as a real check
          return null;
        }
        if (u.locked) throw new Error("LOCKED");

        let ok = false;
        if (u.active) {
          if (u.password_hash) ok = await verifyPassword(password, u.password_hash);
          else if (u.erp_secret) ok = verifyErpSecret(password, process.env.ERP_PW_SCHEME, u.erp_secret);
          else await burnTime(password);
        } else {
          await burnTime(password);
        }

        if (!ok) {
          // count the failure; lock the account for a while after too many in a row
          await query(
            `UPDATE dbo.users
                SET failed_attempts = CASE WHEN failed_attempts + 1 >= @max THEN 0 ELSE failed_attempts + 1 END,
                    locked_until    = CASE WHEN failed_attempts + 1 >= @max THEN DATEADD(minute, @mins, SYSUTCDATETIME()) ELSE locked_until END
              WHERE id = @id`,
            { id: u.id, max: MAX_FAILS, mins: LOCK_MINUTES }
          );
          return null;
        }

        const boot = bootstrapAdmins().includes(loginId) ? 1 : 0;
        await query(
          `UPDATE dbo.users
              SET failed_attempts = 0, locked_until = NULL, last_login = SYSUTCDATETIME(),
                  role = CASE WHEN @boot = 1 THEN 'admin' ELSE role END
            WHERE id = @id`,
          { id: u.id, boot }
        );
        return { id: u.id, name: u.full_name ?? loginId };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 }, // sign in again after 8 hours
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = user.id; // set once, at sign-in
      return token;
    },
    async session({ session, token }) {
      (session as any).uid = token.uid;
      return session;
    },
  },
};
