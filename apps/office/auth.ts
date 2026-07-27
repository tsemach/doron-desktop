import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig from "./auth.config";
import { verifyAdminCredentials } from "./lib/verifyAdminCredentials";

// No DrizzleAdapter -- that's only needed for OAuth account linking /
// DB-persisted sessions, neither of which this credentials-only, JWT-strategy
// admin app uses (see apps/backend/auth.ts for the OAuth+adapter version).
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
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
