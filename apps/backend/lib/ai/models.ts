// Provider -> AI Gateway namespace, and the exact model ids this backend
// will accept per provider. Model *alias* normalization (e.g.
// "claude-3-5-sonnet-online" -> "claude-3-5-sonnet-20241022") happens in
// Rust before the request ever reaches here
// (llm_provider.rs::normalize_model_name) -- this table only maps an
// already-canonical model id to a Gateway namespace and rejects anything
// it doesn't recognize, so an unexpected client payload can't reach
// streamText() with an arbitrary model string.
//
// Model ids below mirror apps/desktop/src/components/Settings/SettingAiProvider.tsx's
// online model lists, plus SettingVoiceEngine.tsx's separate voice-cloud
// model lists (VOICE_CLOUD_MODELS) -- voice's health check and
// transcription route through this same /api/v1/ai/complete-adjacent
// online-mode path (check_ai_health) with its own provider/model
// selection, independent of the main AI Provider config.

const GATEWAY_NAMESPACE: Record<string, string> = {
  claude: "anthropic",
  anthropic: "anthropic",
  gemini: "google",
  google: "google",
  openai: "openai",
};

const MODELS_BY_NAMESPACE: Record<string, string[]> = {
  anthropic: ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229"],
  google: ["gemini-1.5-pro", "gemini-2.0-flash-exp", "gemini-3.1-flash-lite", "gemini-3.5-flash"],
  openai: ["gpt-4o", "o1-mini", "gpt-4o-mini", "gpt-5.6-luna", "gpt-5.6-terra"],
};

/**
 * Resolves a (provider, model) pair from the desktop client into a
 * "namespace/model" id the AI Gateway understands, e.g. "anthropic/claude-3-5-sonnet-20241022".
 * Returns null if the provider is unrecognized or the model isn't in that
 * provider's known set -- callers must reject the request rather than pass
 * an unresolved model through to the Gateway.
 */
export function resolveGatewayModel(provider: string, model: string): string | null {
  const namespace = GATEWAY_NAMESPACE[provider.toLowerCase()];
  if (!namespace) return null;

  const known = MODELS_BY_NAMESPACE[namespace] ?? [];
  if (!known.includes(model)) return null;
  
  return `${namespace}/${model}`;
}

// Gateway transcription model id for OpenAI voice input. Always used
// regardless of the model the client passed -- llm_provider_openai.rs's
// transcribe() hardcodes "whisper-1" in its multipart form today (OpenAI's
// chat-completion model ids like gpt-4o-mini can't do STT), so this
// preserves that exact behavior rather than "fixing" it. See
// docs/ai-online-proxy/voice_transcription_architecture.md §3.4.
const OPENAI_TRANSCRIPTION_MODEL = "openai/whisper-1";

/**
 * Resolves a (provider, model) pair for voice transcription. Unlike
 * resolveGatewayModel, OpenAI ignores the passed model entirely (see
 * OPENAI_TRANSCRIPTION_MODEL above) -- only Gemini's selection actually
 * matters, since Gemini transcription is a plain generateText call using
 * whatever chat model the client picked, not a dedicated transcription
 * model. Returns null for any other provider (reject).
 */
export function resolveTranscriptionModel(provider: string, model: string): string | null {
  const normalized = provider.toLowerCase();
  if (normalized === "openai") return OPENAI_TRANSCRIPTION_MODEL;
  if (normalized === "gemini") return resolveGatewayModel("gemini", model);
  return null;
}
