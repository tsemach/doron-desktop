import type { PaymentProvider } from "./types";

// Mock implementation — no real payment gateway exists yet (no Paddle
// vendor/API credentials). "Checkout" is a local page that immediately
// simulates success and posts straight to our own webhook route, so the
// full checkout -> webhook -> users.tier loop is real and testable end to
// end even though no money or external provider is actually involved.
//
// verifyAndParseWebhook trusts the request body as-is — a real provider's
// implementation MUST verify a signature here (Paddle sends one); this mock
// intentionally skips that since there's nothing to verify against yet.
export class MockPaymentProvider implements PaymentProvider {
  async createCheckoutSession(userId: string, _email: string, platform?: string): Promise<{ checkoutUrl: string }> {
    const params = new URLSearchParams({ userId });
    if (platform) params.set("platform", platform);
    return { checkoutUrl: `/checkout/mock?${params.toString()}` };
  }

  async verifyAndParseWebhook(req: Request): Promise<{ userId: string; tier: "free" | "pro" } | null> {
    const body = await req.json();
    if (!body?.userId || (body.tier !== "free" && body.tier !== "pro")) {
      return null;
    }
    return { userId: body.userId, tier: body.tier };
  }
}

export function getPaymentProvider(): PaymentProvider {
  return new MockPaymentProvider();
}
