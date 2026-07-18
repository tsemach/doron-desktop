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
 * the cloud provider at all); only "cloud" depends on the configured
 * provider supporting audio.
 */
export function checkVoiceCapability(
  settings: { voice_engine?: string; provider?: string } | null
): VoiceCapabilityResult {
  const voiceEngine = settings?.voice_engine || "local";
  if (voiceEngine === "local") {
    return { disabled: false, reason: null };
  }

  const provider = settings?.provider || "";
  if (AUDIO_CAPABLE_PROVIDERS.includes(provider)) {
    return { disabled: false, reason: null };
  }

  return {
    disabled: true,
    reason: "Voice input needs an OpenAI or Gemini API key. Switch your AI provider in Settings, or use the local voice engine.",
  };
}
