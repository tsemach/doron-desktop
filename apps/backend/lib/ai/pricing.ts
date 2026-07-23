// Cents per 1M tokens, keyed by the resolved "namespace/model" id from
// models.ts. Kept as cents (not fractional dollars) so cost math stays
// integer throughout -- matches ai_requests.cost_cents / ai_usage_periods.cost_cents.
//
// IMPORTANT: these figures are the author's best recollection of each
// model's list price at the time these (now legacy/frozen) model ids were
// current -- they have NOT been verified against each provider's live
// pricing page as part of this change. Verify before relying on this for
// real billing enforcement. gemini-2.0-flash-exp shipped as a free/preview
// model with no confirmed stable price -- treated as $0 here, not assumed.
const MODEL_PRICING_CENTS_PER_MILLION: Record<string, { input: number; output: number }> = {
  "anthropic/claude-3-5-sonnet-20241022": { input: 300, output: 1500 },
  "anthropic/claude-3-opus-20240229": { input: 1500, output: 7500 },
  "google/gemini-1.5-pro": { input: 125, output: 500 },
  "google/gemini-2.0-flash-exp": { input: 0, output: 0 },
  "openai/gpt-4o": { input: 250, output: 1000 },
  "openai/o1-mini": { input: 300, output: 1200 },
};

/**
 * Computes the cost in cents for a completed (or partially completed)
 * request. Rounds up (never down) -- this feeds budget enforcement, and
 * under-counting spend by rounding down would let cumulative usage drift
 * above a user's actual budget over many requests.
 */
export function computeCostCents(gatewayModel: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING_CENTS_PER_MILLION[gatewayModel];
  if (!pricing) {
    throw new Error(`No pricing configured for model "${gatewayModel}"`);
  }
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return Math.ceil(inputCost + outputCost);
}
