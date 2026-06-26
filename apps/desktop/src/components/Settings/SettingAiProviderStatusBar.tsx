interface SavedConfig {
  aiMode: string;
  provider: string;
  aiModel: string;
}

interface SettingAiProviderStatusBarProps {
  savedConfig: SavedConfig;
  savedConfigStatus: "idle" | "verified" | "failed";
}

export default function SettingAiProviderStatusBar({
  savedConfig,
  savedConfigStatus,
}: SettingAiProviderStatusBarProps) {
  const getStatusLineStyles = () => {
    switch (savedConfigStatus) {
      case "verified":
        return {
          wrapper: "bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300",
          dot: "bg-emerald-500 animate-pulse",
          label: "text-emerald-950 dark:text-emerald-100 font-semibold",
          badge: "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/10"
        };
      case "failed":
        return {
          wrapper: "bg-red-500/5 dark:bg-red-500/10 border-red-500/20 text-red-800 dark:text-red-300",
          dot: "bg-red-500",
          label: "text-red-950 dark:text-red-100 font-semibold",
          badge: "bg-red-500/10 dark:bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/10"
        };
      default:
        return {
          wrapper: "bg-muted/40 dark:bg-muted/20 border-border/60 text-muted-foreground",
          dot: "bg-muted-foreground/50",
          label: "text-foreground font-semibold",
          badge: "bg-muted dark:bg-muted/80 text-muted-foreground border-border/40"
        };
    }
  };

  const statusStyles = getStatusLineStyles();

  return (
    <div className={`border rounded-xl px-4 py-2.5 flex items-center justify-between text-xs animate-fade-in ${statusStyles.wrapper}`}>
      <div className="flex items-center gap-2">
        <span className={`size-2 rounded-full shrink-0 ${statusStyles.dot}`} />
        <span>
          <strong>Active LLM Service: </strong>
          <span className={`capitalize ${statusStyles.label}`}>{savedConfig.provider}</span>{" "}
          <span className={savedConfigStatus === "idle" ? "text-foreground" : ""}>
            ({savedConfig.aiModel})
          </span>
        </span>
      </div>
      <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded font-mono border ${statusStyles.badge}`}>
        {savedConfig.aiMode === "byom" ? "BYOM" : savedConfig.aiMode}
      </span>
    </div>
  );
}
