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

// Whisper is billed per minute of audio, not per token -- unlike every
// other model in this file. Author's best recollection of OpenAI's public
// Whisper rate ($0.006/min) at time of writing, NOT verified against
// OpenAI's live pricing page -- same caveat as the rest of this file (see
// header comment), flagged as open in
// docs/ai-online-proxy/voice_transcription_architecture.md §13.
const OPENAI_WHISPER_CENTS_PER_MINUTE = 0.6;

/**
 * Computes transcription cost in cents. OpenAI (Whisper) is priced per
 * minute of audio -- durationSeconds is what matters, inputTokens/outputTokens
 * are ignored. Gemini transcription is a plain generateText call (see
 * models.ts::resolveTranscriptionModel), so it's billed identically to any
 * other Gemini request via the existing token-based computeCostCents --
 * durationSeconds is ignored there.
 *
 * resolvedModel is the Gateway model id from resolveTranscriptionModel
 * (e.g. "google/gemini-3.5-flash") -- needed for Gemini's per-model pricing
 * lookup; unused for OpenAI, whose rate isn't model-specific.
 */
export function computeTranscriptionCostCents(
  provider: string,
  resolvedModel: string,
  durationSeconds: number,
  inputTokens?: number,
  outputTokens?: number
): number {
  const normalized = provider.toLowerCase();
  if (normalized === "openai") {
    return Math.ceil((durationSeconds / 60) * OPENAI_WHISPER_CENTS_PER_MINUTE);
  }
  if (normalized === "gemini") {
    return computeCostCents(resolvedModel, inputTokens ?? 0, outputTokens ?? 0);
  }
  throw new Error(`No transcription pricing configured for provider "${provider}"`);
}
