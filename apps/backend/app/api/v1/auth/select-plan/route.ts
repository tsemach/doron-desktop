import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "../../../../../auth";
import { db } from "../../../../../database";
import { users } from "../../../../../database/schema";

// Only "free" is accepted today — Pro requires real payment integration
// (Paddle, not yet wired, see PLAN.md Phase 1's PaymentProvider abstraction).
// Rejecting "pro" here server-side too, not just hiding the button client-side,
// so a direct API call can't self-grant Pro before billing exists.
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { tier } = await request.json();
    if (tier !== "free") {
      return NextResponse.json(
        { error: "Pro billing isn't available yet — Free is the only plan that can be selected right now." },
        { status: 400 }
      );
    }

    await db.update(users).set({ tier: "free", planSelectedAt: new Date() }).where(eq(users.id, session.user.id));

    return NextResponse.json({ tier: "free" });
  } catch (error: any) {
    console.error("Select-plan error:", error);
    return NextResponse.json({ error: error.message || "Failed to set plan" }, { status: 500 });
  }
}
