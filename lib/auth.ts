import type { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import { query } from "./db";

const list = (v: string | undefined, fallback = "") =>
  (v ?? fallback)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export const ALLOWED_DOMAINS = list(process.env.ALLOWED_DOMAINS, "jmaluminium.com,jmaluminium.in");
const bootstrapAdmins = () => list(process.env.INITIAL_ADMIN_EMAILS);

/**
 * The person's real mailbox address. Preferred order: Microsoft Graph "mail" (the actual mailbox),
 * then the "email" claim, then the sign-in name (UPN). Graph is asked once per sign-in.
 */
async function resolveEmail(profile: any, user: any, account: any): Promise<string> {
  let graphMail = "";
  if (account?.access_token) {
    try {
      const r = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", {
        headers: { Authorization: `Bearer ${account.access_token}` },
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) graphMail = String((await r.json()).mail || "");
    } catch {
      /* fall back to the token claims */
    }
  }
  return String(graphMail || profile?.email || profile?.preferred_username || user?.email || "")
    .trim()
    .toLowerCase();
}

export function domainOk(email: string) {
  const parts = email.split("@");
  return parts.length === 2 && ALLOWED_DOMAINS.includes(parts[1]);
}

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.MS_CLIENT_ID!,
      clientSecret: process.env.MS_CLIENT_SECRET!,
      // single-tenant: only accounts in your own Microsoft 365 can sign in
      tenantId: process.env.MS_TENANT_ID!,
      authorization: { params: { scope: "openid profile email User.Read" } },
    }),
  ],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 }, // sign in again after 8 hours
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ profile, user, account }) {
      const email = await resolveEmail(profile, user, account);
      if (!domainOk(email)) return false;
      const rows = await query<{ active: boolean }>("SELECT active FROM dbo.users WHERE email=@email", { email });
      if (rows[0] && !rows[0].active) return false; // disabled by an admin
      return true;
    },
    async jwt({ token, profile, user, account }) {
      if (profile) {
        // runs only at sign-in: create or update the user row
        const email = await resolveEmail(profile, user, account);
        const name = String((profile as any).name || user?.name || email.split("@")[0]).slice(0, 200);
        const boot = bootstrapAdmins().includes(email) ? 1 : 0;
        const rows = await query<{ id: string }>(
          `UPDATE dbo.users
              SET full_name = COALESCE(NULLIF(@name, N''), full_name),
                  last_login = SYSUTCDATETIME(),
                  role = CASE WHEN @boot = 1 THEN 'admin' ELSE role END
            WHERE email = @email;
           IF @@ROWCOUNT = 0
             INSERT INTO dbo.users (email, full_name, role, last_login)
             VALUES (@email, @name, CASE WHEN @boot = 1 THEN 'admin' ELSE 'user' END, SYSUTCDATETIME());
           SELECT id FROM dbo.users WHERE email = @email;`,
          { email, name, boot }
        );
        token.uid = rows[0]?.id;
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).uid = token.uid;
      return session;
    },
  },
};
