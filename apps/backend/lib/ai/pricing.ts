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
  // Voice-cloud models (SettingVoiceEngine.tsx's VOICE_CLOUD_MODELS) -- the
  // figures there ($ per 1M input/output) are the source these were
  // converted from, not independently re-verified here.
  "google/gemini-3.1-flash-lite": { input: 25, output: 150 },
  "google/gemini-3.5-flash": { input: 150, output: 900 },
  "openai/gpt-4o-mini": { input: 15, output: 60 },
  "openai/gpt-5.6-luna": { input: 100, output: 600 },
  "openai/gpt-5.6-terra": { input: 250, output: 1500 },
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
