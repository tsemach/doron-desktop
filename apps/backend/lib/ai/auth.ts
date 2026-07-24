import { eq } from "drizzle-orm";
import { db } from "../../database";
import { desktopSessions, users } from "../../database/schema";

export interface AuthorizedSession {
  userId: string;
  tier: "free" | "pro";
}

export type AuthorizationResult = { session: AuthorizedSession } | { error: string; status: number };

/**
 * Token-in-body auth shared by every backend-proxied AI route (/complete,
 * /transcribe, ...). Same lookup as desktop-session/route.ts, plus the
 * userId/tier these routes need for quota checks and usage recording that
 * desktop-session/route.ts doesn't select.
 */
export async function authorizeRequest(token: string): Promise<AuthorizationResult> {
  const [row] = await db
    .select({ userId: users.id, tier: users.tier, expiresAt: desktopSessions.expiresAt })
    .from(desktopSessions)
    .innerJoin(users, eq(users.id, desktopSessions.userId))
    .where(eq(desktopSessions.token, token))
    .limit(1);

  if (!row || row.expiresAt.getTime() < Date.now()) {
    return { error: "Session no longer valid", status: 401 };
  }

  // Server-side enforcement -- never trust the desktop's own is_pro_tier
  // gate alone; free tier must not be able to reach the Gateway at all.
  if (row.tier !== "pro") {
    return { error: "Cloud AI is a Pro feature.", status: 403 };
  }

  return { session: { userId: row.userId, tier: row.tier } };
}
