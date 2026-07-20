import { randomBytes } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../database";
import { users, verificationTokens } from "../database/schema";
import { getEmailProvider } from "./email/mock-provider";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Reuses the verificationTokens table already in schema.ts (part of the
// NextAuth adapter's standard shape) -- it existed, unused, before this.
export async function createEmailVerification(
  email: string,
  origin: string,
  platform?: string
): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + VERIFICATION_TTL_MS);

  await db.insert(verificationTokens).values({ identifier: email, token, expires });

  const params = new URLSearchParams({ token, email });
  if (platform) params.set("platform", platform);
  const verifyUrl = `${origin}/verify-email?${params.toString()}`;

  await getEmailProvider().sendVerificationEmail(email, verifyUrl);
}

// Single-use: the matching row is deleted whether or not it was expired, so
// a stale/guessed token can't be retried.
export async function consumeEmailVerification(
  email: string,
  token: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db
    .select()
    .from(verificationTokens)
    .where(and(eq(verificationTokens.identifier, email), eq(verificationTokens.token, token)))
    .limit(1);

  if (!row) {
    return { ok: false, error: "This verification link is invalid or has already been used." };
  }

  await db
    .delete(verificationTokens)
    .where(and(eq(verificationTokens.identifier, email), eq(verificationTokens.token, token)));

  if (row.expires.getTime() < Date.now()) {
    return { ok: false, error: "This verification link has expired. Please register again." };
  }

  await db.update(users).set({ emailVerified: new Date() }).where(eq(users.email, email));

  return { ok: true };
}
