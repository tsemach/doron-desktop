import { useState, useEffect, useRef } from "react";
import { Check, Activity } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ProviderSelector, ModelSelector } from "./SettingAiComponents";
import SettingAiProviderLocal from "./SettingAiProviderLocal";
import SettingAiProviderOnline from "./SettingAiProviderOnline";
import SettingAiProviderByom from "./SettingAiProviderByom";
import SettingAiProviderByomApiKey from "./SettingAiProviderByomApiKey";
import SettingAiProviderSelectionHeader from "./SettingAiProviderSelectionHeader";
import SettingAiProviderStatusBar from "./SettingAiProviderStatusBar";
import SettingAiProviderHeader from "./SettingAiProviderHeader";

interface SettingAiProviderProps {
  aiMode: string;
  setAiMode: (val: string) => void;
  aiProvider: string;
  setAiProvider: (val: string) => void;
  aiModel: string;
  setAiModel: (val: string) => void;
  providerApiKey: string;
  setProviderApiKey: (val: string) => void;
  onSave: () => void;
  saved: boolean;
  setSaved: (val: boolean) => void;
  onToggleHelp: () => void;
  onOpenHelp: () => void;
  activeHelp: string | null;
  setHealthCheckResult: (res: any) => void;
  savedConfig?: {
    aiMode: string;
    provider: string;
    aiModel: string;
    apiKey: string;
  } | null;
  savedConfigStatus: "idle" | "verified" | "failed";
  healthStatus: "idle" | "verified" | "failed";
  setHealthStatus: (val: "idle" | "verified" | "failed") => void;
  hasChanges: boolean;
  isSaving: boolean;
}

export default function SettingAiProvider({
  aiMode,
  setAiMode,
  aiProvider,
  setAiProvider,
  aiModel,
  setAiModel,
  providerApiKey,
  setProviderApiKey,
  onSave,
  saved,
  setSaved,
  onToggleHelp,
  onOpenHelp,
  activeHelp,
  setHealthCheckResult,
  savedConfig,
  savedConfigStatus,
  healthStatus,
  setHealthStatus,
  hasChanges,
  isSaving,
}: SettingAiProviderProps) {
  const [checkingHealth, setCheckingHealth] = useState(false);
  const isCancelledRef = useRef(false);

  // Model download and installation states
  const [isModelInstalled, setIsModelInstalled] = useState<boolean>(true);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);
  const [downloadPercent, setDownloadPercent] = useState<number>(0);
  const [installError, setInstallError] = useState<string | null>(null);

  // Model lists mappings
  const localModels: Record<string, string[]> = {
    google: ["Gemma 4 E4B (Q4)"],
    microsoft: [
      "Phi-4-mini-instruct (3.8B Q4)",
      "Phi-3.5-mini-instruct (3.8B Q4)"
    ],
    alibaba: ["Qwen-2.5-1.5B-Instruct (Q4)", "Qwen-2.5-3B-Instruct (Q4)"],
  };

  const onlineModels: Record<string, string[]> = {
    gemini: ["gemini-2.0-flash-exp", "gemini-1.5-pro-online"],
    openai: ["gpt-4o-online", "o1-mini"],
    anthropic: ["claude-3-5-opus-online", "claude-3-5-sonnet-online"],
    other: ["deepseek-chat", "perplexity"],
  };

  // Check if local model is downloaded when mode or model selection changes
  useEffect(() => {
    if (aiMode === "local") {
      checkModelInstalled(aiModel);
    } else {
      setIsModelInstalled(true);
      setIsInstalling(false);
      setInstallError(null);
    }
  }, [aiMode, aiModel]);

  const checkModelInstalled = async (model: string) => {
    if (!model) return;
    try {
      const installed = await invoke<boolean>("check_local_model_status", { modelName: model });
      setIsModelInstalled(installed);
    } catch (err) {
      console.error("Failed to check model status:", err);
      setIsModelInstalled(false);
    }
  };

  const handleInstallModel = async () => {
    setIsInstalling(true);
    setDownloadPercent(0);
    setInstallError(null);
    try {
      let unlistenFn: (() => void) | null = null;
      // Start listening to the progress event from Rust
      const listenPromise = listen<any>("model-download-progress", (event) => {
        const payload = event.payload;
        if (payload.model_name === aiModel) {
          setDownloadPercent(Math.round(payload.percent));
          if (payload.status === "completed") {
            setIsModelInstalled(true);
            setIsInstalling(false);
            setDownloadPercent(100);
            if (unlistenFn) unlistenFn();
          } else if (payload.status === "failed") {
            setInstallError(payload.error || "Download failed");
            setIsInstalling(false);
            if (unlistenFn) unlistenFn();
          }
        }
      });

      listenPromise.then((cleanup) => {
        unlistenFn = cleanup;
      }).catch(err => {
        console.error("Failed to subscribe to download progress:", err);
      });

      // Call Rust to start the installation
      await invoke("install_local_model", { modelName: aiModel });
    } catch (err: any) {
      setInstallError(err.toString());
      setIsInstalling(false);
    }
  };

  // Adjust model options when provider or mode changes, and map names back and forth
  useEffect(() => {
    if (!aiProvider) return;

    if (aiMode === "local") {
      // Map old online provider names to local equivalents
      if (aiProvider === "gemini") {
        setAiProvider("google");
        return;
      } else if (aiProvider === "openai") {
        setAiProvider("microsoft");
        return;
      } else if (aiProvider === "anthropic" || aiProvider === "other") {
        setAiProvider("alibaba");
        return;
      }
    } else if (aiMode === "online" || aiMode === "byom") {
      // Map local provider names back to online equivalents
      if (aiProvider === "google") {
        setAiProvider("gemini");
        return;
      } else if (aiProvider === "microsoft") {
        setAiProvider("openai");
        return;
      } else if (aiProvider === "alibaba") {
        setAiProvider("gemini");
        return;
      }
    }
    
    let list: string[] = [];
    if (aiMode === "local") {
      list = localModels[aiProvider.toLowerCase()] || [];
    } else if (aiMode === "online" || aiMode === "byom") {
      list = onlineModels[aiProvider.toLowerCase()] || [];
    }

    if (list.length > 0 && !list.includes(aiModel)) {
      setAiModel(list[0]);
    }
  }, [aiMode, aiProvider]);

  const handleHealthCheck = async () => {
    isCancelledRef.current = false;
    setCheckingHealth(true);
    setHealthCheckResult(null);
    try {
      const response = await invoke<string>("check_ai_health", {
        config: {
          ai_mode: aiMode,
          provider: aiProvider,
          ai_model: aiModel,
          api_key_enc: providerApiKey,
        },
      });
      if (isCancelledRef.current) return;
      setHealthStatus("verified");
      setHealthCheckResult({
        success: true,
        message: response,
        modelName: aiModel,
        providerName: aiProvider,
        mode: aiMode,
      });
    } catch (err: any) {
      if (isCancelledRef.current) return;
      setHealthStatus("failed");
      setHealthCheckResult({
        success: false,
        message: err.toString(),
        modelName: aiModel,
        providerName: aiProvider,
        mode: aiMode,
      });
    } finally {
      if (!isCancelledRef.current) {
        setCheckingHealth(false);
      }
    }
  };

  const handleCancelHealthCheck = async () => {
    isCancelledRef.current = true;
    setCheckingHealth(false);
    setHealthStatus("idle");
    setHealthCheckResult(null);
    try {
      await invoke("stop_llama_server");
    } catch (err) {
      console.error("Failed to stop llama server on cancel:", err);
    }
  };

  const getAvailableModels = () => {
    const key = aiProvider.toLowerCase();
    if (aiMode === "local") {
      return localModels[key] || [];
    }
    return onlineModels[key] || [];
  };

  const getAvailableProviders = () => {
    if (aiMode === "local") {
      return [
        { id: "google", name: "Google" },
        { id: "microsoft", name: "Microsoft" },
        { id: "alibaba", name: "Alibaba" },
      ];
    }
    return [
      { id: "gemini", name: "Gemini" },
      { id: "openai", name: "OpenAI" },
      { id: "anthropic", name: "Anthropic" },
      { id: "other", name: "Other" },
    ];
  };

  const getModelDescription = (model: string) => {
    switch (model) {
      case "Qwen-2.5-1.5B-Instruct (Q4)":
        return "Low Performance / Battery Saver Mode (RAM footprint: ~1.1 GB). Best for older or 8GB RAM machines. Fast execution on basic email classification, but may struggle with highly complex, lengthy contracts.";
      case "Qwen-2.5-3B-Instruct (Q4)":
        return "Balanced / Standard Mode (RAM footprint: ~1.9 GB). The standard baseline choice. Exceptional at structured JSON formatting and metadata parsing, runs smoothly on average CPUs.";
      case "Phi-4-mini-instruct (3.8B Q4)":
        return "Advanced / Long Documents Mode (RAM footprint: ~2.2 GB). Best for 16GB RAM machines. Features a native 128K context window, ideal for long trial transcripts or complex contracts.";
      case "Phi-3.5-mini-instruct (3.8B Q4)":
        return "Stable Baseline / Balanced Mode (RAM footprint: ~2.2 GB). Best for 16GB RAM machines. Outstanding performance-to-size ratio with a native 128K context window.";
      case "Gemma 4 E4B (Q4)":
        return "Alternative Capable Mode (RAM footprint: ~2.5 GB). Strong multimodal and agentic capability, slightly higher memory overhead.";
      default:
        return "";
    }
  };



  return (
    <div className="bg-card border border-border/80 shadow-lg rounded-2xl p-6 md:p-8 space-y-6 w-full animate-fade-in">
      
      {/* Header */}
      <SettingAiProviderHeader healthStatus={healthStatus} />

      {/* Active Configuration Status Bar */}
      {savedConfig && savedConfig.aiMode && (
        <SettingAiProviderStatusBar
          savedConfig={savedConfig}
          savedConfigStatus={savedConfigStatus}
        />
      )}

      {/* Mode selection - modern card selectors */}
      <div className="space-y-2">
        <SettingAiProviderSelectionHeader
          onToggleHelp={onToggleHelp}
          activeHelp={activeHelp}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Local Mode Card */}
          <SettingAiProviderLocal
            aiMode={aiMode}
            setAiMode={setAiMode}
            setSaved={setSaved}
            setHealthStatus={setHealthStatus}
            aiProvider={aiProvider}
            setAiProvider={setAiProvider}
            onOpenHelp={onOpenHelp}
          />

          {/* Online Pro Mode Card */}
          <SettingAiProviderOnline
            aiMode={aiMode}
            setAiMode={setAiMode}
            setSaved={setSaved}
            setHealthStatus={setHealthStatus}
            aiProvider={aiProvider}
            setAiProvider={setAiProvider}
            onOpenHelp={onOpenHelp}
          />

          {/* BYOM Card */}
          <SettingAiProviderByom
            aiMode={aiMode}
            setAiMode={setAiMode}
            setSaved={setSaved}
            setHealthStatus={setHealthStatus}
            aiProvider={aiProvider}
            setAiProvider={setAiProvider}
            onOpenHelp={onOpenHelp}
          />
        </div>
      </div>

      {/* Dynamic Settings Fields based on operational mode */}
      {aiMode && (
        <div className="space-y-4 pt-2 border-t border-border/40 animate-fade-in">
          <div className="grid grid-cols-2 gap-4">
            {/* Provider Selector - Reusable */}
            <div className="col-span-2 sm:col-span-1">
              <ProviderSelector
                value={aiProvider}
                onChange={(val) => {
                  setAiProvider(val);
                  setSaved(false);
                  setHealthStatus("idle");
                }}
                disabled={isInstalling}
                providers={getAvailableProviders()}
                onToggleHelp={onToggleHelp}
                activeHelp={activeHelp}
              />
            </div>

            {/* Model Selector */}
            <div className="col-span-2 sm:col-span-1">
              <ModelSelector
                value={aiModel}
                onChange={(val) => {
                  setAiModel(val);
                  setSaved(false);
                  setHealthStatus("idle");
                }}
                disabled={isInstalling}
                models={getAvailableModels()}
                onToggleHelp={onToggleHelp}
                activeHelp={activeHelp}
              />
            </div>

            {/* API Key Input (only for BYOM) */}
            {aiMode === "byom" && (
              <SettingAiProviderByomApiKey
                providerApiKey={providerApiKey}
                setProviderApiKey={setProviderApiKey}
                setSaved={setSaved}
                setHealthStatus={setHealthStatus}
                onToggleHelp={onToggleHelp}
                activeHelp={activeHelp}
              />
            )}
          </div>

          {/* Local Mode Details (Descriptions & Downloads) */}
          {aiMode === "local" && (
            <div className="space-y-3 pt-2">
              {/* Hardware Requirements Description */}
              {getModelDescription(aiModel) && (
                <div className="p-3 bg-muted/40 border border-border/40 rounded-xl text-xs text-muted-foreground leading-relaxed">
                  <span className="font-bold text-foreground block mb-0.5">Resource Requirements:</span>
                  {getModelDescription(aiModel)}
                </div>
              )}

              {/* Model Not Installed warning and action banner */}
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
                        The selected model <span className="font-semibold text-foreground">{aiModel}</span> exists but is not yet downloaded. You must download it to use local mode.
                      </p>
                    </div>
                  </div>

                  {isInstalling ? (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs font-semibold text-foreground">
                        <span className="flex items-center gap-2">
                          <span className="size-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
                          Downloading model...
                        </span>
                        <span>{downloadPercent}%</span>
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
            </div>
          )}

          {/* Action Row - Health Check */}
          <div className="flex justify-end items-center gap-2 pt-2">
            {checkingHealth && (
              <button
                type="button"
                onClick={handleCancelHealthCheck}
                className="flex items-center gap-1.5 px-3 py-2 border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-semibold rounded-lg transition-all cursor-pointer shadow-sm animate-fade-in"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={handleHealthCheck}
              disabled={checkingHealth || isInstalling || !isModelInstalled || (aiMode === "byom" && !providerApiKey)}
              className="flex items-center gap-1.5 px-4 py-2 border border-border bg-background hover:bg-accent disabled:opacity-50 text-foreground text-xs font-semibold rounded-lg transition-all cursor-pointer shadow-sm"
            >
              {checkingHealth ? (
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
        </div>
      )}

      {/* Separator line */}
      <div className="border-t border-border/60 my-6"></div>

      {/* Save Button */}
      <div className="pt-2">
        <button
          onClick={onSave}
          disabled={!aiMode || !hasChanges || isSaving || isInstalling || !isModelInstalled}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer shadow-md ${
            saved
              ? "bg-emerald-600 text-white hover:bg-emerald-700 animate-pulse"
              : "bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black shadow-neutral-950/10 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
          }`}
        >
          {isSaving ? (
            "Saving & Verifying..."
          ) : saved ? (
            <>
              <Check className="size-4" />
              Saved Settings
            </>
          ) : (
            "Save AI Preferences"
          )}
        </button>
      </div>
    </div>
  );
}
