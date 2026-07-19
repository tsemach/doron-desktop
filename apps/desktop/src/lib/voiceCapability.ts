// Providers that support audio transcription via transcribe_audio_cloud
// (apps/desktop/src-tauri/src/llm/cloud_transcribe.rs) — Claude has no audio
// input support, so it (and local/mock) are excluded.
export const AUDIO_CAPABLE_PROVIDERS = ["gemini", "openai"];

export interface VoiceCapabilityResult {
  disabled: boolean;
  reason: string | null;
}

/**
 * Given the current AI settings (the raw shape returned by the
 * `get_ai_settings` Tauri command), determines whether voice input is usable
 * right now, and if not, why — for gating a mic button with an explanatory
 * tooltip. The "local" voice engine never needs this check (it doesn't touch
 * any cloud provider at all). "cloud" uses its own dedicated
 * voice_cloud_provider/voice_cloud_api_key settings (independent of the main
 * AI Provider config) for both transcription and field extraction, so
 * capability just depends on whether an API key is set for that provider.
 */
export function checkVoiceCapability(
  settings: { voice_engine?: string; voice_cloud_provider?: string; voice_cloud_api_key?: string } | null
): VoiceCapabilityResult {
  const voiceEngine = settings?.voice_engine || "local";
  if (voiceEngine === "local") {
    return { disabled: false, reason: null };
  }

  const provider = settings?.voice_cloud_provider || "";
  const apiKey = settings?.voice_cloud_api_key || "";
  if (AUDIO_CAPABLE_PROVIDERS.includes(provider) && apiKey.trim()) {
    return { disabled: false, reason: null };
  }

  return {
    disabled: true,
    reason: "Voice input needs a cloud provider and API key set in Settings → Voice Input Engine → Cloud.",
  };
}
