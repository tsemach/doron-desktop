import { and, eq, isNull } from "drizzle-orm";
import { auth } from "../../auth";
import { db } from "../../database";
import { users } from "../../database/schema";
import { authorizeDesktopToken } from "../desktopAuth";
import type { Actor } from "../permissions";

export type OrgAuthResult = { actor: Actor } | { error: string; status: number };

// Desktop-callable org routes (/api/v1/org/desktop/...) -- token-in-body,
// same authorizeDesktopToken lookup the AI proxy uses. No extra gate here
// (unlike lib/ai/auth.ts's Pro-tier check) -- roles/firms are available on
// every tier.
export async function authorizeOrgRequest(token: string): Promise<OrgAuthResult> {
  const result = await authorizeDesktopToken(token);
  if ("error" in result) {
    return result;
  }
  return { actor: { id: result.identity.userId, role: result.identity.role, firmId: result.identity.firmId } };
}

// Cookie-authenticated org routes (/api/v1/org/...), for any future web UI.
// Deliberately re-fetches role/firmId fresh from `users` rather than
// trusting the NextAuth session/JWT -- same reasoning as auth.ts's own
// session callback re-fetching `tier` fresh: a role change must take
// effect immediately, not after the JWT rotates. This also means this
// route family doesn't depend on session.user.role/firmId existing on the
// JWT at all (that's a separate, later change -- see implementation_plan.md
// Phase 3).
export async function authorizeOrgSession(): Promise<OrgAuthResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized", status: 401 };
  }

  const [row] = await db
    .select({ id: users.id, role: users.role, firmId: users.firmId })
    .from(users)
    .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)))
    .limit(1);

  if (!row) {
    return { error: "Unauthorized", status: 401 };
  }

  return { actor: row };
}
