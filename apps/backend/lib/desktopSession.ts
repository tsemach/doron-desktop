import { randomBytes } from "crypto";
import { db } from "../database";
import { desktopSessions } from "../database/schema";

const DESKTOP_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Shared by desktop-login (password) and desktop-token (post-OAuth) — both
// prove identity differently, but once proven, minting a desktop session is
// identical either way. See those two routes for how each proves identity.
export async function createDesktopSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + DESKTOP_SESSION_TTL_MS);

  await db.insert(desktopSessions).values({ userId, token, expiresAt });

  return { token, expiresAt };
}
