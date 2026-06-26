
interface SettingAiProviderOnlineProps {
  aiMode: string;
  setAiMode: (val: string) => void;
  setSaved: (val: boolean) => void;
  setHealthStatus: (val: "idle" | "verified" | "failed") => void;
  aiProvider: string;
  setAiProvider: (val: string) => void;
  onOpenHelp: () => void;
}

export default function SettingAiProviderOnline({
  aiMode,
  setAiMode,
  setSaved,
  setHealthStatus,
  aiProvider,
  setAiProvider,
  onOpenHelp,
}: SettingAiProviderOnlineProps) {
  return (
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
  );
}
