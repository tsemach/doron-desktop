import { useState, useEffect, useRef } from "react";
import { Check, Activity } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ProviderSelector, ModelSelector } from "./SettingAiComponents";
import SettingAiProviderByomApiKey from "./SettingAiProviderByomApiKey";
import SettingAiProviderByomLink from "./SettingAiProviderByomLink";
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

  const onlineModels: Record<string, string[]> = {
    gemini: ["gemini-2.0-flash-exp", "gemini-1.5-pro-online"],
    openai: ["gpt-4o-online", "o1-mini"],
    anthropic: ["claude-3-5-opus-online", "claude-3-5-sonnet-online"],
    other: ["deepseek-chat", "perplexity"],
  };

  // Reset the model to the new provider's first option whenever the
  // provider changes (online and byom share the same provider/model lists).
  useEffect(() => {
    if (!aiProvider) return;
    const list = onlineModels[aiProvider.toLowerCase()] || [];
    if (list.length > 0 && !list.includes(aiModel)) {
      setAiModel(list[0]);
    }
  }, [aiProvider]);

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

  // Note: Commented out because TS6133 (unused local) is enabled and this is currently not called in the UI.
  /*
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
  */

  const getAvailableModels = () => {
    return onlineModels[aiProvider.toLowerCase()] || [];
  };

  const getAvailableProviders = () => [
    { id: "gemini", name: "Gemini" },
    { id: "openai", name: "OpenAI" },
    { id: "anthropic", name: "Anthropic" },
    { id: "other", name: "Other" },
  ];

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

      <SettingAiProviderSelectionHeader
        onToggleHelp={onToggleHelp}
        activeHelp={activeHelp}
      />

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
              models={getAvailableModels()}
              onToggleHelp={onToggleHelp}
              activeHelp={activeHelp}
            />
          </div>
        </div>

        {/* BYOM: advanced, opt-in link that reveals the API key field */}
        <div className="pt-1">
          <SettingAiProviderByomLink
            aiMode={aiMode}
            setAiMode={setAiMode}
            setSaved={setSaved}
            setHealthStatus={setHealthStatus}
            onOpenHelp={onOpenHelp}
          />

          {aiMode === "byom" && (
            <div className="grid grid-cols-2 gap-4 pt-3">
              <SettingAiProviderByomApiKey
                providerApiKey={providerApiKey}
                setProviderApiKey={setProviderApiKey}
                setSaved={setSaved}
                setHealthStatus={setHealthStatus}
                onToggleHelp={onToggleHelp}
                activeHelp={activeHelp}
              />
            </div>
          )}
        </div>

        {/* Action Row - Health Check */}
        <div className="flex justify-end items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleHealthCheck}
            disabled={checkingHealth || (aiMode === "byom" && !providerApiKey)}
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

      {/* Separator line */}
      <div className="border-t border-border/60 my-6"></div>

      {/* Save Button */}
      <div className="pt-2">
        <button
          onClick={onSave}
          disabled={!aiMode || !hasChanges || isSaving}
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
