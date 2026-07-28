import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Facebook from "next-auth/providers/facebook";

// Same OAuth env vars as apps/backend -- reuse the same Google/Facebook
// OAuth app, just with this app's callback URL also registered as an
// authorized redirect URI in those dashboards (not something code can do).
export default {
  session: {
    strategy: "jwt",
  },
  // Cookies aren't scoped by port, only by domain -- on localhost, backend
  // (:3000) and office (:3001) are the same "domain" as far as the browser
  // is concerned, so without distinct names office's session-token cookie
  // collides with backend's (encrypted under a different AUTH_SECRET),
  // producing "JWTSessionError: no matching decryption secret". Only `name`
  // is set per cookie -- Auth.js deep-merges this over its default options
  // (httpOnly/sameSite/secure/etc.), so nothing else changes.
  cookies: {
    sessionToken: { name: "authjs.office-session-token" },
    callbackUrl: { name: "authjs.office-callback-url" },
    csrfToken: { name: "authjs.office-csrf-token" },
    pkceCodeVerifier: { name: "authjs.office-pkce.code_verifier" },
    state: { name: "authjs.office-state" },
    nonce: { name: "authjs.office-nonce" },
    webauthnChallenge: { name: "authjs.office-challenge" },
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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig;
