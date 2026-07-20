import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../../../../../database";
import { users } from "../../../../../database/schema";
import { getPaymentProvider } from "../../../../../lib/payments/mock-provider";

// Provider-agnostic route name (not /webhooks/paddle) so swapping the
// provider later doesn't mean changing the URL a real provider is
// configured to call.
export async function POST(request: Request) {
  try {
    const provider = getPaymentProvider();
    const result = await provider.verifyAndParseWebhook(request);
    if (!result) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }

    // planSelectedAt too, same as select-plan's Free path (Phase 0) -- a Pro
    // checkout completing means this user has chosen a plan, which is what
    // the OAuth callback pages check to decide whether to route to
    // /register/plan or straight into the app.
    await db.update(users).set({ tier: result.tier, planSelectedAt: new Date() }).where(eq(users.id, result.userId));

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Payments webhook error:", error);
    return NextResponse.json({ error: error.message || "Webhook processing failed" }, { status: 500 });
  }
}
