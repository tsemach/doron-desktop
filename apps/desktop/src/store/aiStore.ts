import { atom, getDefaultStore } from "jotai";
import { invoke } from "@tauri-apps/api/core";

export interface AiConfig {
  aiMode: string;
  provider: string;
  aiModel: string;
  apiKey: string;
  voiceEngine: string;
  voiceModel: string;
  voiceCloudProvider: string;
  voiceCloudApiKey: string;
  voiceCloudModel: string;
}

export const aiConfigAtom = atom<AiConfig | null>(null);
export const aiConfigStatusAtom = atom<"idle" | "verified" | "failed">("idle");

export async function triggerGlobalHealthCheck() {
  const store = getDefaultStore();

  try {
    // 1. Fetch AI settings from database
    const res = await invoke<any>("get_ai_settings");
    if (!res) {
      store.set(aiConfigAtom, null);
      store.set(aiConfigStatusAtom, "idle");
      return;
    }

    // Local mode is no longer selectable from Settings (AMI-65) -- displayed
    // here as "online" so this atom (Settings.tsx's savedConfig / hasChanges
    // reference) matches what loadSettings() shows, instead of perpetually
    // disagreeing for a pre-existing local-mode user. The actual health
    // check call just below still uses the raw res.ai_mode, so a genuinely
    // local-configured app keeps behaving exactly as before.
    const localToOnlineProvider: Record<string, string> = { google: "gemini", microsoft: "openai", alibaba: "gemini" };
    const isLocal = res.ai_mode === "local";
    const config: AiConfig = {
      aiMode: isLocal ? "online" : (res.ai_mode || "online"),
      provider: isLocal ? (localToOnlineProvider[res.provider] || "gemini") : (res.provider || "gemini"),
      aiModel: isLocal ? "" : (res.ai_model || ""),
      apiKey: res.api_key_enc || "",
      voiceEngine: res.voice_engine === "local" ? "cloud" : (res.voice_engine || "cloud"),
      voiceModel: res.voice_model || "whisper multilingual (small)",
      voiceCloudProvider: res.voice_cloud_provider || "gemini",
      voiceCloudApiKey: res.voice_cloud_api_key || "",
      voiceCloudModel: res.voice_cloud_model || "gemini-3.5-flash",
    };
    store.set(aiConfigAtom, config);

    // 2. If no config or no provider/model defined, set status to idle
    // (neutral grey) -- checked against the raw saved values, not the
    // display-coerced `config` above, so a pre-existing local-mode user's
    // startup health check still actually runs instead of being skipped
    // because its coerced aiModel was blanked out for display purposes.
    if (!res.ai_mode || !res.provider || !res.ai_model) {
      store.set(aiConfigStatusAtom, "idle");
      return;
    }

    // 3. Run real health check
    const fallbackApiKey = localStorage.getItem("claude_api_key") || "";
    const response = await invoke<string>("check_ai_health", {
      config: {
        ai_mode: res.ai_mode,
        provider: res.provider,
        ai_model: res.ai_model,
        api_key_enc: res.api_key_enc || fallbackApiKey,
      }
    });

    if (response) {
      store.set(aiConfigStatusAtom, "verified");
    } else {
      store.set(aiConfigStatusAtom, "failed");
    }
  } catch (err) {
    console.error("[triggerGlobalHealthCheck] Error checking AI health:", err);
    store.set(aiConfigStatusAtom, "failed");
    throw err;
  }
}
