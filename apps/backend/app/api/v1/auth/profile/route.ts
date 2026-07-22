import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "../../../../../auth";
import { db } from "../../../../../database";
import { users } from "../../../../../database/schema";

// Session (auth.config.ts) intentionally stays lean (name/email/id/tier) --
// the profile page needs a couple of fields beyond that (emailVerified,
// createdAt), so it gets its own small fetch instead of growing the JWT.
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const [user] = await db
      .select({
        name: users.name,
        email: users.email,
        emailVerified: users.emailVerified,
        tier: users.tier,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error: any) {
    console.error("Profile fetch error:", error);
    return NextResponse.json({ error: error.message || "Failed to load profile" }, { status: 500 });
  }
}
