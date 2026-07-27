import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../database";
import { adminUsers } from "../database/schema";

// One generic error for "no such account" and "wrong password" -- a
// distinct message would let an attacker enumerate admin emails.
const GENERIC_ERROR = "Invalid email or password.";

export async function verifyAdminCredentials(
  email: string,
  password: string
): Promise<{ user: typeof adminUsers.$inferSelect } | { error: string }> {
  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1);

  if (!user || !user.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) {
    return { error: GENERIC_ERROR };
  }

  return { user };
}
