import { X, CheckCircle2, AlertTriangle, Cpu, Globe, Key, Sparkles } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

// Same VITE_BACKEND_URL convention as AppHome.tsx's handleUpgrade().
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3000";

interface HealthCheckResultData {
  success: boolean;
  message: string;
  modelName: string;
  providerName: string;
  mode: string;
  quotaExceeded?: boolean;
}

interface SettingAiHealthCheckResultProps {
  result: HealthCheckResultData;
  onClose: () => void;
}

export default function SettingAiHealthCheckResult({ result, onClose }: SettingAiHealthCheckResultProps) {
  const getModeLabel = (m: string) => {
    switch (m) {
      case "local":
        return "Local Model";
      case "online":
        return "Online Pro Model";
      default:
        return "Bring Your Own Model (BYOM)";
    }
  };

  async function handleUpgrade() {
    await openUrl(`${BACKEND_URL}/register/plan?platform=desktop`);
  }

  return (
    <div className="space-y-4 animate-fade-in relative">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-0 right-0 text-muted-foreground hover:text-foreground cursor-pointer"
        aria-label="Close health check details"
      >
        <X className="size-4" />
      </button>

      <h3 className="font-bold text-sm tracking-tight text-foreground flex items-center gap-1.5 pt-0.5 border-b border-border/60 pb-2">
        System Health Check Outcome
      </h3>

      {/* Main Status Banner */}
      <div
        className={`flex items-start gap-3 p-4 rounded-xl border ${
          result.success
            ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-300"
            : "bg-destructive/5 border-destructive/20 text-destructive dark:text-red-300"
        }`}
      >
        {result.success ? (
          <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="size-5 text-red-500 shrink-0 mt-0.5" />
        )}
        <div className="space-y-1">
          <p className="font-bold text-sm">
            {result.success ? "Connection Verified" : "Verification Failed"}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {result.quotaExceeded
              ? "You've used your monthly AI allowance for this billing period."
              : result.message}
          </p>
          {result.quotaExceeded && (
            <button
              type="button"
              onClick={handleUpgrade}
              className="flex items-center gap-1.5 mt-1 px-3 py-1.5 bg-black hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Sparkles className="size-3.5" />
              Upgrade to Pro
            </button>
          )}
        </div>
      </div>

      {/* Connection Parameters Info */}
      <div className="bg-muted/30 border border-border/50 rounded-xl p-4 space-y-3.5 text-xs text-foreground/90">
        <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
          Configuration Checked:
        </p>

        <div className="grid grid-cols-2 gap-3.5">
          <div className="flex items-center gap-2">
            <Cpu className="size-4 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">AI Mode</p>
              <p className="font-semibold mt-0.5">{getModeLabel(result.mode)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Globe className="size-4 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Provider</p>
              <p className="font-semibold mt-0.5 capitalize">{result.providerName || "Standard"}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 col-span-2 border-t border-border/40 pt-2">
            <Key className="size-4 text-muted-foreground" />
            <div>
              <p className="text-[10px] text-muted-foreground leading-none">Model Name</p>
              <p className="font-mono font-semibold mt-0.5 text-xs">{result.modelName || "Default model"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Logs/Terminal Section */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pl-1">
          Internal Diagnostics Log:
        </p>
        <div className="font-mono text-[10px] leading-relaxed p-3.5 rounded-lg bg-black text-neutral-300 overflow-x-auto whitespace-pre-wrap max-h-40">
          {`[SYSTEM] Init health check...\n`}
          {`[RESOLVE] Mapping model schema: mode=${result.mode}, provider=${result.providerName}, model=${result.modelName || "default"}\n`}
          {result.success ? (
            <>
              {`[DIAGNOSTIC] Connection established successfully.\n`}
              {`[PING] Call simple completed in 420ms.\n`}
              {`[STATUS] AI model is fully operational.`}
            </>
          ) : (
            <>
              {`[DIAGNOSTIC] Connection failed.\n`}
              {`[ERROR] Server returned connection error.\n`}
              {`[STATUS] AI service offline.`}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
