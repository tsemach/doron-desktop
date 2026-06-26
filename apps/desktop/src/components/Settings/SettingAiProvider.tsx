import { useState, useEffect } from "react";
import { Check, Activity } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
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

  // Model lists mappings
  const localModels: Record<string, string[]> = {
    gemini: ["gemini-1.5-flash-local", "gemini-1.5-pro-local"],
    openai: ["gpt-4o-mini-local", "gpt-4o-local"],
    anthropic: ["claude-3-5-sonnet-local", "claude-3-haiku-local"],
    other: ["llama3", "mistral", "custom-local"],
  };

  const onlineModels: Record<string, string[]> = {
    gemini: ["gemini-2.0-flash-exp", "gemini-1.5-pro-online"],
    openai: ["gpt-4o-online", "o1-mini"],
    anthropic: ["claude-3-5-opus-online", "claude-3-5-sonnet-online"],
    other: ["deepseek-chat", "perplexity"],
  };

// Adjust model options when provider or mode changes
  useEffect(() => {
    if (!aiProvider) return;
    
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
      setHealthStatus("verified");
      setHealthCheckResult({
        success: true,
        message: response,
        modelName: aiModel,
        providerName: aiProvider,
        mode: aiMode,
      });
    } catch (err: any) {
      setHealthStatus("failed");
      setHealthCheckResult({
        success: false,
        message: err.toString(),
        modelName: aiModel,
        providerName: aiProvider,
        mode: aiMode,
      });
    } finally {
      setCheckingHealth(false);
    }
  };

  const getAvailableModels = () => {
    const key = aiProvider.toLowerCase();
    if (aiMode === "local") {
      return localModels[key] || [];
    }
    return onlineModels[key] || [];
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

          {/* Action Row - Health Check */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleHealthCheck}
              disabled={checkingHealth || (aiMode === "byom" && !providerApiKey)}
              className="flex items-center gap-1.5 px-4 py-2 border border-border bg-background hover:bg-accent disabled:opacity-50 text-foreground text-xs font-semibold rounded-lg transition-all cursor-pointer shadow-sm"
            >
              <Activity className={`size-3.5 ${checkingHealth ? "animate-pulse" : ""}`} />
              {checkingHealth ? "Running check..." : "Run Health Check"}
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
