import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../../../database";
import { desktopSessions, users } from "../../../../../database/schema";

// Re-validates an existing desktop session token -- called by the desktop
// app's refreshSession() (via the verify_session Tauri command) whenever
// it's online, so a deleted/banned user or a tier change (e.g. the payment
// webhook flipping tier on cancellation) is picked up without waiting for
// the desktop's cached session to hit its own 30-day TTL. Unlike
// desktop-login/desktop-token, this never mints a new token -- it only
// confirms the one already held is still valid and returns current tier.
export async function POST(request: Request) {
  try {
    const { token } = await request.json();
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const [row] = await db
      .select({
        expiresAt: desktopSessions.expiresAt,
        email: users.email,
        tier: users.tier,
      })
      .from(desktopSessions)
      .innerJoin(users, eq(users.id, desktopSessions.userId))
      .where(eq(desktopSessions.token, token))
      .limit(1);

    // Deleted user cascades the desktop_sessions row away (schema.ts's
    // onDelete: "cascade"), so a deleted account naturally lands here too.
    if (!row || row.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "Session no longer valid" }, { status: 401 });
    }

    return NextResponse.json({
      email: row.email,
      tier: row.tier,
      expiresAt: row.expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error("Desktop session verify error:", error);
    return NextResponse.json({ error: error.message || "Verification failed" }, { status: 500 });
  }
}
