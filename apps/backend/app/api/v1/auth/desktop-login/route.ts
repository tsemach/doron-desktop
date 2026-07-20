import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../../../../../database";
import { users, desktopSessions } from "../../../../../database/schema";

const DESKTOP_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Missing email or password" }, { status: 400 });
    }

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    if (!user || !user.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + DESKTOP_SESSION_TTL_MS);

    await db.insert(desktopSessions).values({
      userId: user.id,
      token,
      expiresAt,
    });

    return NextResponse.json({
      token,
      email: user.email,
      tier: user.tier,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error("Desktop login error:", error);
    return NextResponse.json({ error: error.message || "Login failed" }, { status: 500 });
  }
}
