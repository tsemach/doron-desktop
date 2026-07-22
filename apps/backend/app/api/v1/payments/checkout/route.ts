import { NextResponse } from "next/server";
import { auth } from "../../../../../auth";
import { getPaymentProvider } from "../../../../../lib/payments/mock-provider";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session.user.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { platform } = await request.json().catch(() => ({ platform: undefined }));

    const provider = getPaymentProvider();
    const { checkoutUrl } = await provider.createCheckoutSession(session.user.id, session.user.email, platform);

    return NextResponse.json({ checkoutUrl });
  } catch (error: any) {
    console.error("Checkout error:", error);
    return NextResponse.json({ error: error.message || "Failed to start checkout" }, { status: 500 });
  }
}
