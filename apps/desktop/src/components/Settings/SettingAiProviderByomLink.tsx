import SettingByomLink from "./SettingByomLink";

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
    <SettingByomLink
      isActive={isActive}
      onClick={() => {
        setAiMode(isActive ? "online" : "byom");
        setSaved(false);
        setHealthStatus("idle");
        if (!isActive) onOpenHelp();
      }}
    />
  );
}
