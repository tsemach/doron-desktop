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
// online model lists, post-normalization.

const GATEWAY_NAMESPACE: Record<string, string> = {
  claude: "anthropic",
  anthropic: "anthropic",
  gemini: "google",
  google: "google",
  openai: "openai",
};

const MODELS_BY_NAMESPACE: Record<string, string[]> = {
  anthropic: ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229"],
  google: ["gemini-1.5-pro", "gemini-2.0-flash-exp"],
  openai: ["gpt-4o", "o1-mini"],
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
