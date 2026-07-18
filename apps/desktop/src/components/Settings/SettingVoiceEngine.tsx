import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Check } from "lucide-react";

const AUDIO_CAPABLE_PROVIDERS = ["gemini", "openai"];

// Mirrors llm_local_mode.rs's whisper model registry entries.
const VOICE_MODELS = [
  { value: "ivrit-ai whisper large-v3-turbo (hebrew)", label: "Hebrew (ivrit-ai, large-v3-turbo)" },
  { value: "whisper multilingual (small)", label: "Multilingual (small, faster)" },
];

interface SettingVoiceEngineProps {
  voiceEngine: string;
  setVoiceEngine: (val: string) => void;
  voiceModel: string;
  setVoiceModel: (val: string) => void;
  aiProvider: string;
  onToggleHelp: () => void;
  activeHelp: string | null;
}

export default function SettingVoiceEngine({
  voiceEngine,
  setVoiceEngine,
  voiceModel,
  setVoiceModel,
  aiProvider,
  onToggleHelp,
  activeHelp,
}: SettingVoiceEngineProps) {
  const supportsAudio = AUDIO_CAPABLE_PROVIDERS.includes(aiProvider);

  const [isModelInstalled, setIsModelInstalled] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [installError, setInstallError] = useState<string | null>(null);

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
        </div>
      ) : supportsAudio ? (
        <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
          Uses your configured {aiProvider} account to transcribe voice input.
        </p>
      ) : (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-900/40 rounded-lg px-3 py-2">
          Your configured provider ({aiProvider || "none"}) doesn't support audio transcription. Voice input will be disabled until you switch your AI provider above to Gemini or OpenAI.
        </p>
      )}
    </div>
  );
}
