import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db } from "./database";
import { adminUsers, accounts, sessions, verificationTokens } from "./database/schema";
import authConfig from "./auth.config";
import { verifyAdminCredentials } from "./lib/verifyAdminCredentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: adminUsers,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Unlike apps/backend, OAuth here must never be able to create a new
    // admin account. Google/Facebook only prove the person owns that email
    // address -- they say nothing about whether that person should have
    // back-office access. The adapter would otherwise happily auto-create
    // an admin_users row for any Google/Facebook login; reject anything
    // that isn't already a pre-provisioned row (credentials sign-in already
    // enforces this implicitly, since verifyAdminCredentials only matches
    // existing rows).
    async signIn({ user, account }) {
      if (account?.provider === "credentials") {
        return true;
      }
      if (!user.email) {
        return false;
      }
      const [existing] = await db.select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, user.email)).limit(1);
      return !!existing;
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

        const result = await verifyAdminCredentials(credentials.email as string, credentials.password as string);
        if ("error" in result) {
          return null;
        }

        return {
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
        };
      },
    }),
  ],
});
