// Swappable payment-provider interface — mirrors the pattern already used
// twice in this codebase (llm/llm_provider.rs's trait for LLM backends,
// featureGating.ts's FeatureGateProvider for the gating stub). Paddle is the
// intended real implementation once credentials exist; mock-provider.ts is
// the only implementation for now.
export interface PaymentProvider {
  // `platform` ("desktop" or undefined) needs to survive the round trip so the
  // post-checkout redirect can branch the same way the Free path already does
  // (apps/backend/app/register/plan/page.tsx). The mock implementation just
  // carries it in the checkout URL's query string; a real provider would carry
  // it via that provider's own metadata/custom-data field instead, since you
  // can't tack query params onto a hosted checkout page you don't control.
  createCheckoutSession(
    userId: string,
    email: string,
    platform?: string
  ): Promise<{ checkoutUrl: string }>;
  verifyAndParseWebhook(req: Request): Promise<{ userId: string; tier: "free" | "pro" } | null>;
}
