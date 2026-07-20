import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../../../../../database";
import { users } from "../../../../../database/schema";
import { createDesktopSession } from "../../../../../lib/desktopSession";

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

    const { token, expiresAt } = await createDesktopSession(user.id);

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
