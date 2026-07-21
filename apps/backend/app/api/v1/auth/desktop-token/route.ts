import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "../../../../../auth";
import { db } from "../../../../../database";
import { users } from "../../../../../database/schema";
import { createDesktopSession } from "../../../../../lib/desktopSession";

// Mints a desktop session token for the user already authenticated via the
// NextAuth web session (browser cookie) — used right after an OAuth login
// completes, so the desktop app can pick up a token without ever handling
// the OAuth flow itself. See 0.9 in PLAN.md.
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { token, expiresAt } = await createDesktopSession(user.id);

    return NextResponse.json({
      token,
      email: user.email,
      tier: user.tier,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error("Desktop token error:", error);
    return NextResponse.json({ error: error.message || "Failed to issue token" }, { status: 500 });
  }
}
