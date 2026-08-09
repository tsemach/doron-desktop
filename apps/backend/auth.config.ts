import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";

export default {
  session: {
    strategy: "jwt",
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Facebook({
      clientId: process.env.AUTH_FACEBOOK_ID,
      clientSecret: process.env.AUTH_FACEBOOK_SECRET,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // `user` here is the full adapter row (DrizzleAdapter), not just
        // NextAuth's narrow base User type -- planSelectedAt/tier/role/
        // firmId exist on it at runtime even though the base type doesn't
        // declare them.
        token.planSelectedAt = (user as { planSelectedAt?: Date | null }).planSelectedAt ?? null;
        token.tier = (user as { tier?: string }).tier ?? "free";
        // ASC-142 -- same "cache on the JWT, re-fetch fresh where it
        // matters" pattern as tier (see auth.ts's session callback override).
        token.role = (user as { role?: string }).role ?? "flat";
        token.firmId = (user as { firmId?: string | null }).firmId ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { planSelectedAt?: Date | null }).planSelectedAt = token.planSelectedAt as Date | null;
        (session.user as { tier?: string }).tier = (token.tier as string) ?? "free";
        (session.user as { role?: string }).role = (token.role as string) ?? "flat";
        (session.user as { firmId?: string | null }).firmId = (token.firmId as string | null) ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig;
