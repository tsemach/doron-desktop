import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../database";
import { users } from "../database/schema";

// Shared by auth.ts's Credentials provider (web /login) and
// desktop-login/route.ts (desktop app, bypasses NextAuth entirely) -- both
// need the same password + email-verified check, previously duplicated
// bcrypt logic between them.
//
// Deliberately one generic error for "wrong password" and "email not
// verified" rather than two distinct messages: a distinct message would let
// an attacker enumerate which emails are registered-but-unverified.
const GENERIC_ERROR = "Invalid email or password, or your email hasn't been verified yet.";

export async function verifyCredentials(
  email: string,
  password: string
): Promise<{ user: typeof users.$inferSelect } | { error: string }> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user || !user.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) {
    return { error: GENERIC_ERROR };
  }
  if (!user.emailVerified) {
    return { error: GENERIC_ERROR };
  }

  return { user };
}
