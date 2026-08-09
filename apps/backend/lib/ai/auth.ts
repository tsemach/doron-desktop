import { authorizeDesktopToken } from "../desktopAuth";

export interface AuthorizedSession {
  userId: string;
  tier: "free" | "pro";
}

export type AuthorizationResult = { session: AuthorizedSession } | { error: string; status: number };

/**
 * Token-in-body auth shared by every backend-proxied AI route (/complete,
 * /transcribe, ...). Builds on the shared desktopSessions lookup in
 * lib/desktopAuth.ts (also used by the ASC-142 org API), adding the
 * Pro-tier gate that's specific to AI usage -- the org API has no such gate.
 */
export async function authorizeRequest(token: string): Promise<AuthorizationResult> {
  const result = await authorizeDesktopToken(token);
  if ("error" in result) {
    return result;
  }

  // Server-side enforcement -- never trust the desktop's own is_pro_tier
  // gate alone; free tier must not be able to reach the Gateway at all.
  if (result.identity.tier !== "pro") {
    return { error: "Cloud AI is a Pro feature.", status: 403 };
  }

  return { session: { userId: result.identity.userId, tier: result.identity.tier } };
}
