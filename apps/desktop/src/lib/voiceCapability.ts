import { isFeatureEnabled } from "./featureGating";

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
 * tooltip. Voice input always goes through the cloud engine, using its own
 * dedicated voice_cloud_provider/voice_cloud_api_key settings (independent
 * of the main AI Provider config) for both transcription and field
 * extraction.
 *
 * An API key is no longer required: an empty voice_cloud_api_key now means
 * "online" (backend-proxied, resolve_voice_provider on the Rust side --
 * apps/desktop/src-tauri/src/llm/llm_settings.rs), same as the main AI
 * Provider's online mode; a configured key means BYOM (direct provider
 * call), unchanged from before. Cloud voice is Pro-gated either way —
 * matches transcribe_audio_cloud's server-side is_pro_tier check, which
 * fires before provider resolution regardless of whether a key is set.
 */
export function checkVoiceCapability(
  settings: { voice_cloud_provider?: string; voice_cloud_api_key?: string } | null
): VoiceCapabilityResult {
  if (!isFeatureEnabled("voice_recording")) {
    return { disabled: true, reason: "Voice input is a Pro feature. Upgrade to Pro to use it." };
  }

  const provider = settings?.voice_cloud_provider || "";
  if (!AUDIO_CAPABLE_PROVIDERS.includes(provider)) {
    return {
      disabled: true,
      reason: "Voice input needs Gemini or OpenAI set as the cloud provider in Settings → Voice Input Engine.",
    };
  }

  return { disabled: false, reason: null };
}
