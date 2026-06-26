import { useState, useEffect } from "react";
import { Server, Eye, EyeOff, Check, Activity } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ProviderSelector, ModelSelector } from "./SettingAiComponents";

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
}: SettingAiProviderProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [healthStatus, setHealthStatus] = useState<"idle" | "verified" | "failed">("idle");

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
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5 pt-2">
          <Server className="size-4 text-foreground" />
          AI Provider (LLM) Configuration
        </h2>

        {/* Verified Status Dot */}
        {healthStatus !== "idle" && (
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span
              className={`size-2.5 rounded-full ${
                healthStatus === "verified" ? "bg-emerald-500 animate-pulse" : "bg-red-500"
              }`}
            />
            <span className={healthStatus === "verified" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}>
              {healthStatus === "verified" ? "Verified" : "Check Failed"}
            </span>
          </div>
        )}
      </div>

      {/* Mode selection - modern card selectors */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          Select AI Operational Mode
          <button
            type="button"
            onClick={onToggleHelp}
            className={`text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5 rounded hover:bg-muted ${
              activeHelp === "ai" ? "text-foreground bg-muted" : ""
            }`}
            title="AI Config Help"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </button>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Local Mode Card */}
          <button
            type="button"
            onClick={() => {
              setAiMode("local");
              setSaved(false);
              setHealthStatus("idle");
              if (!aiProvider) setAiProvider("gemini");
              onOpenHelp();
            }}
            className={`flex flex-col items-start text-left p-4 rounded-xl border transition-all cursor-pointer ${
              aiMode === "local"
                ? "bg-accent border-foreground text-foreground shadow-xs font-bold"
                : "border-border bg-background/30 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <span className="text-xs font-bold block">Local Model</span>
            <span className="text-[10px] text-muted-foreground mt-1 font-normal leading-relaxed">
              Runs privacy-first LLMs directly on your computer
            </span>
          </button>

          {/* Online Pro Mode Card */}
          <button
            type="button"
            onClick={() => {
              setAiMode("online");
              setSaved(false);
              setHealthStatus("idle");
              if (!aiProvider) setAiProvider("gemini");
              onOpenHelp();
            }}
            className={`flex flex-col items-start text-left p-4 rounded-xl border transition-all cursor-pointer ${
              aiMode === "online"
                ? "bg-accent border-foreground text-foreground shadow-xs font-bold"
                : "border-border bg-background/30 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <span className="text-xs font-bold block">Online Model</span>
            <span className="text-[10px] text-muted-foreground mt-1 font-normal leading-relaxed">
              Fast, managed cloud AI (Requires Pro account)
            </span>
          </button>

          {/* BYOM Card */}
          <button
            type="button"
            onClick={() => {
              setAiMode("byom");
              setSaved(false);
              setHealthStatus("idle");
              if (!aiProvider) setAiProvider("gemini");
              onOpenHelp();
            }}
            className={`flex flex-col items-start text-left p-4 rounded-xl border transition-all cursor-pointer ${
              aiMode === "byom"
                ? "bg-accent border-foreground text-foreground shadow-xs font-bold"
                : "border-border bg-background/30 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <span className="text-xs font-bold block">Bring Your Own (BYOM)</span>
            <span className="text-[10px] text-muted-foreground mt-1 font-normal leading-relaxed">
              Provide your personal OpenAI, Anthropic, or Gemini API keys
            </span>
          </button>
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
              <div className="col-span-2 animate-fade-in">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5" htmlFor="api-key-input">
                  API Key / Access Token
                  <button
                    type="button"
                    onClick={onToggleHelp}
                    className={`text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5 rounded hover:bg-muted ${
                      activeHelp === "ai" ? "text-foreground bg-muted" : ""
                    }`}
                    title="AI Config Help"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </button>
                </label>
                <div className="relative mt-2">
                  <input
                    id="api-key-input"
                    type={showApiKey ? "text" : "password"}
                    value={providerApiKey}
                    onChange={(e) => {
                      setProviderApiKey(e.target.value);
                      setSaved(false);
                      setHealthStatus("idle");
                    }}
                    placeholder="sk-..."
                    className="w-full pl-4 pr-10 py-2.5 rounded-xl border border-input bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 cursor-pointer text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
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
          disabled={!aiMode}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all cursor-pointer shadow-md ${
            saved
              ? "bg-emerald-600 text-white hover:bg-emerald-700 animate-pulse"
              : "bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black shadow-neutral-950/10 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
          }`}
        >
          {saved ? (
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
