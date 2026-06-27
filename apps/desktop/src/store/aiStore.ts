import { atom, getDefaultStore } from "jotai";
import { invoke } from "@tauri-apps/api/core";

export interface AiConfig {
  aiMode: string;
  provider: string;
  aiModel: string;
  apiKey: string;
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

    const config: AiConfig = {
      aiMode: res.ai_mode || "",
      provider: res.provider || "gemini",
      aiModel: res.ai_model || "",
      apiKey: res.api_key_enc || "",
    };
    store.set(aiConfigAtom, config);

    // 2. If no config or no provider/model defined, set status to idle (neutral grey)
    if (!config.aiMode || !config.provider || !config.aiModel) {
      store.set(aiConfigStatusAtom, "idle");
      return;
    }

    // 3. Run real health check
    const response = await invoke<string>("check_ai_health", {
      config: {
        ai_mode: res.ai_mode,
        provider: res.provider,
        ai_model: res.ai_model,
        api_key_enc: res.api_key_enc,
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
  }
}
