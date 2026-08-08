import { and, eq, isNull } from "drizzle-orm";
import { db } from "../database";
import { desktopSessions, users } from "../database/schema";
import type { Role } from "./permissions";

export interface DesktopIdentity {
  userId: string;
  tier: "free" | "pro";
  role: Role;
  firmId: string | null;
}

export type DesktopAuthResult = { identity: DesktopIdentity } | { error: string; status: number };

// Shared token-in-body lookup for every backend route callable from the
// desktop app (AI proxy, org/roles API, ...) -- desktop holds an opaque
// bearer token (desktopSessions), not a browser cookie, so this is the one
// place that joins it to the current user row. Callers layer their own
// feature-specific checks on top (lib/ai/auth.ts's Pro-tier gate; the org
// API has none beyond "signed in").
//
// isNull(users.deletedAt) closes the soft-delete gap described in
// docs/identity-and-roles/design.md §6 -- a soft-deleted user's token must
// stop working immediately, not linger for up to its 30-day TTL.
export async function authorizeDesktopToken(token: string): Promise<DesktopAuthResult> {
  const [row] = await db
    .select({
      userId: users.id,
      tier: users.tier,
      role: users.role,
      firmId: users.firmId,
      expiresAt: desktopSessions.expiresAt,
    })
    .from(desktopSessions)
    .innerJoin(users, eq(users.id, desktopSessions.userId))
    .where(and(eq(desktopSessions.token, token), isNull(users.deletedAt)))
    .limit(1);

  if (!row || row.expiresAt.getTime() < Date.now()) {
    return { error: "Session no longer valid", status: 401 };
  }

  return { identity: { userId: row.userId, tier: row.tier, role: row.role, firmId: row.firmId } };
}
