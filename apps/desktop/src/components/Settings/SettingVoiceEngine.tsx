import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Check, Activity } from "lucide-react";
import { AUDIO_CAPABLE_PROVIDERS } from "@/lib/voiceCapability";
import { blobToWav16kMono } from "@/lib/audioConversion";
import VoiceFieldInput from "@/components/ui/VoiceFieldInput";

// Mirrors llm_local_mode.rs's whisper model registry entries.
const VOICE_MODELS = [
  { value: "ivrit-ai whisper large-v3-turbo (hebrew)", label: "Hebrew (ivrit-ai, large-v3-turbo)" },
  { value: "whisper multilingual (small)", label: "Multilingual (small, faster)" },
];

// Fast/cheap-first model choices for cloud voice (transcription + field
// extraction) — independent of the main AI Provider's model list, since
// voice's JSON-extraction step doesn't need a large/expensive model.
// `cost` is per-1M-tokens input/output, verified against each provider's
// current pricing page. `free: true` is only set where a genuine free API
// tier is actually confirmed (rate-limited, no billing required) — OpenAI
// has no such tier at all, so none of its models are marked free.
const VOICE_CLOUD_MODELS: Record<string, { value: string; free: boolean; cost: string }[]> = {
  gemini: [
    { value: "gemini-3.1-flash-lite", free: true, cost: "$0.25 / $1.50 per 1M" },
    { value: "gemini-3.5-flash", free: true, cost: "$1.50 / $9 per 1M" },
  ],
  openai: [
    { value: "gpt-4o-mini", free: false, cost: "$0.15 / $0.60 per 1M" },
    { value: "gpt-5.6-luna", free: false, cost: "$1 / $6 per 1M" },
    { value: "gpt-5.6-terra", free: false, cost: "$2.50 / $15 per 1M" },
  ],
};

interface SettingVoiceEngineProps {
  voiceEngine: string;
  setVoiceEngine: (val: string) => void;
  voiceModel: string;
  setVoiceModel: (val: string) => void;
  voiceCloudProvider: string;
  setVoiceCloudProvider: (val: string) => void;
  voiceCloudApiKey: string;
  setVoiceCloudApiKey: (val: string) => void;
  voiceCloudModel: string;
  setVoiceCloudModel: (val: string) => void;
  onToggleHelp: () => void;
  activeHelp: string | null;
  onSave: () => void;
  saved: boolean;
  hasChanges: boolean;
  isSaving: boolean;
  setHealthCheckResult: (res: any) => void;
}

export default function SettingVoiceEngine({
  voiceEngine,
  setVoiceEngine,
  voiceModel,
  setVoiceModel,
  voiceCloudProvider,
  setVoiceCloudProvider,
  voiceCloudApiKey,
  setVoiceCloudApiKey,
  voiceCloudModel,
  setVoiceCloudModel,
  onToggleHelp,
  activeHelp,
  onSave,
  saved,
  hasChanges,
  isSaving,
  setHealthCheckResult,
}: SettingVoiceEngineProps) {
  const [checkingCloudHealth, setCheckingCloudHealth] = useState(false);

  function handleVoiceCloudProviderChange(provider: string) {
    setVoiceCloudProvider(provider);
    setVoiceCloudModel(VOICE_CLOUD_MODELS[provider]?.[0]?.value ?? "");
  }

  // Pings the actual configured voice-cloud provider (not the main AI
  // Provider config) — reuses check_ai_health's existing non-local branch,
  // which does a real call_simple ping when ai_mode != "local".
  async function handleVoiceCloudHealthCheck() {
    setCheckingCloudHealth(true);
    setHealthCheckResult(null);
    try {
      const response = await invoke<string>("check_ai_health", {
        config: {
          ai_mode: "byom",
          provider: voiceCloudProvider,
          ai_model: voiceCloudModel,
          api_key_enc: voiceCloudApiKey,
        },
      });
      setHealthCheckResult({
        success: true,
        message: response,
        modelName: voiceCloudModel,
        providerName: voiceCloudProvider,
        mode: "byom",
      });
    } catch (err: any) {
      setHealthCheckResult({
        success: false,
        message: err.toString(),
        modelName: voiceCloudModel,
        providerName: voiceCloudProvider,
        mode: "byom",
      });
    } finally {
      setCheckingCloudHealth(false);
    }
  }
  const [isModelInstalled, setIsModelInstalled] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [installError, setInstallError] = useState<string | null>(null);

  // Standalone transcription test — records and transcribes only (no field
  // extraction), so whisper-server + model can be verified in isolation
  // without the extra latency/memory cost of the LLM extraction step.
  const [testStatus, setTestStatus] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [testTranscript, setTestTranscript] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const voiceModelRef = useRef(voiceModel);
  useEffect(() => {
    voiceModelRef.current = voiceModel;
  }, [voiceModel]);

  // Global mount listener for download progress events — same event other
  // local-model downloads (LLM) already emit, filtered to this model.
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      try {
        unlistenFn = await listen<any>("model-download-progress", (event) => {
          const payload = event.payload;
          if (payload.model_name === voiceModelRef.current) {
            setDownloadPercent(Math.round(payload.percent));
            if (payload.status === "completed") {
              setIsModelInstalled(true);
              setIsInstalling(false);
              setDownloadPercent(100);
            } else if (payload.status === "failed") {
              setInstallError(payload.error || "Download failed");
              setIsInstalling(false);
            }
          }
        });
      } catch (err) {
        console.error("Failed to subscribe to voice model download progress:", err);
      }
    };

    setupListener();
    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  useEffect(() => {
    if (voiceEngine === "local") {
      checkModelInstalled(voiceModel);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEngine, voiceModel]);

  async function checkModelInstalled(model: string) {
    if (!model) return;
    try {
      const installed = await invoke<boolean>("check_local_model_status", { modelName: model });
      setIsModelInstalled(installed);
      if (!installed) {
        const downloading = await invoke<boolean>("check_model_downloading", { modelName: model });
        setIsInstalling(downloading);
      } else {
        setIsInstalling(false);
      }
    } catch (err) {
      console.error("Failed to check voice model status:", err);
      setIsModelInstalled(false);
      setIsInstalling(false);
    }
  }

  async function handleInstallModel() {
    setIsInstalling(true);
    setDownloadPercent(0);
    setInstallError(null);
    try {
      await invoke("install_local_model", { modelName: voiceModel });
    } catch (err: any) {
      setInstallError(err.toString());
      setIsInstalling(false);
    }
  }

  async function handleCancelDownload() {
    try {
      await invoke("cancel_model_download", { modelName: voiceModel });
    } catch (err) {
      console.error("Failed to cancel voice model download:", err);
    }
  }

  async function handleDeleteModel() {
    if (!window.confirm(`Are you sure you want to delete the model '${voiceModel}'? This will free up disk space.`)) return;
    setIsDeleting(true);
    try {
      await invoke("delete_local_model", { modelName: voiceModel });
      setIsModelInstalled(false);
    } catch (err: any) {
      console.error("Failed to delete voice model:", err);
      alert(`Failed to delete model: ${err.toString()}`);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleTestRecording(blob: Blob) {
    setTestStatus("processing");
    setTestTranscript(null);
    setTestError(null);
    try {
      const wav = await blobToWav16kMono(blob);
      const audioBytes = Array.from(new Uint8Array(await wav.arrayBuffer()));
      const transcript = await invoke<string>("transcribe_audio_local", {
        audioBytes,
        modelName: voiceModel,
        language: null,
      });
      setTestTranscript(transcript);
      setTestStatus("done");
    } catch (err) {
      setTestError(String(err));
      setTestStatus("error");
    }
  }

  async function handleTestCloudRecording(blob: Blob) {
    setTestStatus("processing");
    setTestTranscript(null);
    setTestError(null);
    try {
      const audioBytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      const transcript = await invoke<string>("transcribe_audio_cloud", {
        audioBytes,
        apiKey: voiceCloudApiKey,
        model: voiceCloudModel,
        language: null,
        provider: voiceCloudProvider,
      });
      setTestTranscript(transcript);
      setTestStatus("done");
    } catch (err) {
      setTestError(String(err));
      setTestStatus("error");
    }
  }

  return (
    <div data-testid="voice-engine-setting" className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
          Voice Input Engine
          <button
            type="button"
            onClick={onToggleHelp}
            className={`text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5 rounded hover:bg-muted ${
              activeHelp === "voice" ? "text-foreground bg-muted" : ""
            }`}
            title="Voice Input Help"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Choose how spoken field input (e.g. in New Case or Document Details) is transcribed. Independent of the AI provider above.
        </p>
      </div>

      <div className="inline-flex rounded-md border border-input overflow-hidden">
        {(["local", "cloud"] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setVoiceEngine(opt)}
            className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
              opt !== "local" ? "border-l border-input" : ""
            } ${
              voiceEngine === opt
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>

      {voiceEngine === "local" ? (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
            Runs fully offline — no audio leaves this device.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Model</label>
            <select
              value={voiceModel}
              onChange={(e) => setVoiceModel(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {VOICE_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {!isModelInstalled && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 space-y-3 animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="text-amber-500 mt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-amber-500">Model Not Installed</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    The selected model <span className="font-semibold text-foreground">{voiceModel}</span> exists but is not yet downloaded. You must download it to use local voice input.
                  </p>
                </div>
              </div>

              {isInstalling ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs font-semibold text-foreground">
                    <span className="flex items-center gap-2">
                      <span className="size-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                      Downloading model...
                    </span>
                    <div className="flex items-center gap-3">
                      <span>{downloadPercent}%</span>
                      <button
                        type="button"
                        onClick={handleCancelDownload}
                        className="px-2 py-1 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-[10px] font-bold rounded transition-all cursor-pointer shadow-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  <div className="w-full bg-accent rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-primary h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${downloadPercent}%` }}
                    ></div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4 pt-1">
                  {installError && (
                    <span className="text-[10px] text-red-500 font-semibold truncate max-w-[200px]">
                      Error: {installError}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleInstallModel}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs rounded-lg transition-all shadow-md cursor-pointer ml-auto"
                  >
                    Install Model
                  </button>
                </div>
              )}
            </div>
          )}

          {isModelInstalled && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 space-y-3 animate-fade-in">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="text-emerald-500 mt-0.5">
                    <Check className="size-4.5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-emerald-500">Model Installed</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      The selected model <span className="font-semibold text-foreground">{voiceModel}</span> is fully downloaded and ready to use locally.
                    </p>
                  </div>
                </div>
                {isDeleting ? (
                  <span className="size-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin self-center"></span>
                ) : (
                  <button
                    type="button"
                    onClick={handleDeleteModel}
                    className="px-3 py-1.5 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-semibold text-xs rounded-lg transition-all shadow-sm cursor-pointer self-center"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          )}

          {isModelInstalled && (
            <div data-testid="voice-engine-test" className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-foreground">Test Transcription</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Record a short clip and see exactly what the model transcribes.
                  </p>
                </div>
                <VoiceFieldInput
                  onRecordingComplete={handleTestRecording}
                  disabled={testStatus === "processing"}
                />
              </div>

              {testStatus === "processing" && (
                <p className="text-[11px] text-muted-foreground animate-pulse">Transcribing...</p>
              )}

              {testStatus === "done" && (
                <div className="rounded-lg bg-background border border-border px-3 py-2 text-xs">
                  <span className="font-semibold text-foreground">Transcript:</span>{" "}
                  <span className="text-muted-foreground italic">
                    {testTranscript ? `"${testTranscript}"` : "(empty — no speech detected)"}
                  </span>
                </div>
              )}

              {testStatus === "error" && (
                <p className="text-[11px] text-red-600 dark:text-red-400">
                  Failed: {testError}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
            Uses a dedicated cloud provider for both transcription and field detection —
            independent of the AI Provider (LLM) setting above, so your chat/extraction
            provider there can stay on a different mode (e.g. local) while voice uses the cloud.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Provider</label>
              <select
                value={voiceCloudProvider}
                onChange={(e) => handleVoiceCloudProviderChange(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {AUDIO_CAPABLE_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p === "gemini" ? "Gemini" : "OpenAI"}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Model</label>
              <select
                value={voiceCloudModel}
                onChange={(e) => setVoiceCloudModel(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {(VOICE_CLOUD_MODELS[voiceCloudProvider] ?? []).map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.value}
                  </option>
                ))}
              </select>
              {(() => {
                const selected = VOICE_CLOUD_MODELS[voiceCloudProvider]?.find((m) => m.value === voiceCloudModel);
                if (!selected) return null;
                return (
                  <p className={`text-[10px] font-medium ${selected.free ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                    {selected.free ? "✓ Free" : `${selected.cost} tokens (input / output)`}
                  </p>
                );
              })()}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">API Key</label>
            <input
              type="password"
              value={voiceCloudApiKey}
              onChange={(e) => setVoiceCloudApiKey(e.target.value)}
              placeholder={`Your ${voiceCloudProvider === "gemini" ? "Gemini" : "OpenAI"} API key`}
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {!voiceCloudApiKey.trim() && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-900/40 rounded-lg px-3 py-2">
              Add an API key above to enable cloud voice input.
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleVoiceCloudHealthCheck}
              disabled={checkingCloudHealth || !voiceCloudApiKey.trim()}
              className="flex items-center gap-1.5 px-4 py-2 border border-border bg-background hover:bg-accent disabled:opacity-50 text-foreground text-xs font-semibold rounded-lg transition-all cursor-pointer shadow-sm"
            >
              {checkingCloudHealth ? (
                <>
                  <span className="size-3.5 border-2 border-foreground border-t-transparent rounded-full animate-spin"></span>
                  Running check...
                </>
              ) : (
                <>
                  <Activity className="size-3.5" />
                  Run Health Check
                </>
              )}
            </button>
          </div>

          {voiceCloudApiKey.trim() && (
            <div data-testid="voice-engine-cloud-test" className="space-y-2 rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-foreground">Test Transcription</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Record a short clip and see exactly what the model transcribes.
                  </p>
                </div>
                <VoiceFieldInput
                  onRecordingComplete={handleTestCloudRecording}
                  disabled={testStatus === "processing"}
                />
              </div>

              {testStatus === "processing" && (
                <p className="text-[11px] text-muted-foreground animate-pulse">Transcribing...</p>
              )}

              {testStatus === "done" && (
                <div className="rounded-lg bg-background border border-border px-3 py-2 text-xs">
                  <span className="font-semibold text-foreground">Transcript:</span>{" "}
                  <span className="text-muted-foreground italic">
                    {testTranscript ? `"${testTranscript}"` : "(empty — no speech detected)"}
                  </span>
                </div>
              )}

              {testStatus === "error" && (
                <p className="text-[11px] text-red-600 dark:text-red-400">
                  Failed: {testError}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-border/60 my-1" />

      <button
        onClick={onSave}
        disabled={!hasChanges || isSaving || isInstalling}
        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-bold text-xs transition-all cursor-pointer shadow-sm ${
          saved
            ? "bg-emerald-600 text-white hover:bg-emerald-700 animate-pulse"
            : "bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black disabled:opacity-50 disabled:cursor-not-allowed"
        }`}
      >
        {isSaving ? (
          "Saving..."
        ) : saved ? (
          <>
            <Check className="size-3.5" />
            Saved
          </>
        ) : (
          "Save Voice Settings"
        )}
      </button>
    </div>
  );
}
