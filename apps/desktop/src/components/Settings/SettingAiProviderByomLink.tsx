import { ChevronDown, ChevronRight, KeyRound } from "lucide-react";

interface SettingAiProviderByomLinkProps {
  aiMode: string;
  setAiMode: (val: string) => void;
  setSaved: (val: boolean) => void;
  setHealthStatus: (val: "idle" | "verified" | "failed") => void;
  onOpenHelp: () => void;
}

// Replaces the old BYOM card (SettingAiProviderByom, now removed) now that
// there's no 3-way mode selector -- online is the implicit default and BYOM
// is an opt-in advanced toggle. Same underlying behavior as before: setting
// aiMode to "byom" is what reveals the API key field below (see
// SettingAiProvider.tsx), only the trigger UI changed from a card to a link.
export default function SettingAiProviderByomLink({
  aiMode,
  setAiMode,
  setSaved,
  setHealthStatus,
  onOpenHelp,
}: SettingAiProviderByomLinkProps) {
  const isActive = aiMode === "byom";

  return (
    <button
      type="button"
      onClick={() => {
        setAiMode(isActive ? "online" : "byom");
        setSaved(false);
        setHealthStatus("idle");
        if (!isActive) onOpenHelp();
      }}
      className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors ${
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {isActive ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      <KeyRound className="size-3.5" />
      Bring Your Own (BYOM), advanced
    </button>
  );
}
