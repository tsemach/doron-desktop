import { RefreshCw, Check } from "lucide-react";
import { TranslationKey } from "../../locales/translations";

interface SettingSoftwareUpdateProps {
  appVersion: string;
  updateStatus: "idle" | "checking" | "available" | "up-to-date" | "downloading" | "error";
  updaterError: string;
  availableVersion: string;
  onCheckForUpdates: () => void;
  onInstallManual: () => void;
  t: (key: TranslationKey) => string;
}

export default function SettingSoftwareUpdate({
  appVersion,
  updateStatus,
  updaterError,
  availableVersion,
  onCheckForUpdates,
  onInstallManual,
  t,
}: SettingSoftwareUpdateProps) {
  return (
    <div className="bg-card border border-border/80 shadow-lg rounded-2xl p-6 md:p-8 space-y-6 w-full animate-fade-in">
      {/* Software Updates Section */}
      <h2 className="text-sm font-bold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5 pt-2">
        <RefreshCw className="size-4 text-foreground animate-[spin_8s_linear_infinite]" />
        {t("software_updates") || "Software Updates"}
      </h2>

      <div className="bg-background/40 border border-border/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Current Version</p>
          <p className="text-sm font-semibold mt-0.5">{appVersion || "Loading..."}</p>
        </div>

        <div>
          {updateStatus === "checking" && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <RefreshCw className="size-3.5 animate-spin" />
              Checking...
            </span>
          )}
          {updateStatus === "up-to-date" && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
              <Check className="size-3.5" />
              App is up-to-date
            </span>
          )}
          {updateStatus === "available" && (
            <div className="flex flex-col sm:items-end gap-1.5">
              <span className="text-xs font-semibold text-blue-500">
                Version {availableVersion} available
              </span>
              <button
                onClick={onInstallManual}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400 text-white dark:text-zinc-950 text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-sm"
              >
                Update & Restart
              </button>
            </div>
          )}
          {updateStatus === "downloading" && (
            <span className="text-xs text-blue-500 font-semibold flex items-center gap-1.5">
              <RefreshCw className="size-3.5 animate-spin" />
              Downloading...
            </span>
          )}
          {updateStatus === "error" && (
            <div className="flex flex-col sm:items-end gap-1">
              <span className="text-[10px] text-red-500 max-w-[160px] truncate">{updaterError}</span>
              <button
                onClick={onCheckForUpdates}
                className="text-xs text-foreground hover:underline cursor-pointer"
              >
                Try check again
              </button>
            </div>
          )}
          {updateStatus === "idle" && (
            <button
              onClick={onCheckForUpdates}
              className="w-full sm:w-auto px-4 py-2 border border-border bg-background hover:bg-accent rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-sm"
            >
              Check for Updates
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
