import { ChevronDown, ChevronRight, KeyRound } from "lucide-react";

interface SettingByomLinkProps {
  isActive: boolean;
  onClick: () => void;
}

// Shared visual affordance for "reveal a personal API key field" -- used by
// both AI Provider (SettingAiProviderByomLink, where activating it is a real
// aiMode change) and Voice Input Engine (a plain local reveal toggle, no
// underlying mode to switch), so both settings sections look the same.
export default function SettingByomLink({ isActive, onClick }: SettingByomLinkProps) {
  return (
    <button
      type="button"
      onClick={onClick}
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
