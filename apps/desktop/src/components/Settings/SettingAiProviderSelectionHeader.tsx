interface SettingAiProviderSelectionHeaderProps {
  onToggleHelp: () => void;
  activeHelp: string | null;
}

export default function SettingAiProviderSelectionHeader({
  onToggleHelp,
  activeHelp,
}: SettingAiProviderSelectionHeaderProps) {
  return (
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
  );
}
