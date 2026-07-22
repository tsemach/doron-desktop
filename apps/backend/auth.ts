import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Credentials from "next-auth/providers/credentials";
import { db } from "./database";
import { users, accounts, sessions, verificationTokens } from "./database/schema";
import { eq } from "drizzle-orm";
import authConfig from "./auth.config";
import { verifyCredentials } from "./lib/verifyCredentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // authConfig.session (shared with middleware.ts's edge-runtime auth
    // instance, which has no DB access) just copies the JWT's cached tier
    // -- stale after a tier change (e.g. mock checkout) until the token
    // rotates on next sign-in. Re-fetches fresh here instead, since this
    // path only runs in the full Node.js runtime (route handlers, server
    // components, /api/auth/session) which does have DB access. Middleware
    // never reads session.user.tier -- only isLoggedIn -- so it doesn't
    // need this and deliberately keeps using the cheaper JWT-only version.
    async session(params) {
      const session = await authConfig.callbacks!.session!(params);
      if (session.user?.id) {
        const [row] = await db.select({ tier: users.tier }).from(users).where(eq(users.id, session.user.id)).limit(1);
        if (row) {
          (session.user as { tier?: string }).tier = row.tier;
        }
      }
      return session;
    },
  },
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const result = await verifyCredentials(credentials.email as string, credentials.password as string);
        if ("error" in result) {
          return null;
        }

        return {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
          image: result.user.image,
        };
      },
    }),
  ],
  events: {
    // Google/Facebook already proved the email -- no separate verification
    // step needed for those (only Credentials-based signups go through
    // lib/emailVerification.ts). Not conditioned on the current
    // emailVerified value (NextAuth's base User type doesn't expose it here)
    // -- re-stamping an already-verified OAuth user is a harmless no-op.
    async signIn({ user, account }) {
      if (account?.provider !== "credentials" && user.id) {
        await db.update(users).set({ emailVerified: new Date() }).where(eq(users.id, user.id));
      }
    },
  },
});
