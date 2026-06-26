import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface SettingAiProviderByomApiKeyProps {
  providerApiKey: string;
  setProviderApiKey: (val: string) => void;
  setSaved: (val: boolean) => void;
  setHealthStatus: (val: "idle" | "verified" | "failed") => void;
  onToggleHelp: () => void;
  activeHelp: string | null;
}

export default function SettingAiProviderByomApiKey({
  providerApiKey,
  setProviderApiKey,
  setSaved,
  setHealthStatus,
  onToggleHelp,
  activeHelp,
}: SettingAiProviderByomApiKeyProps) {
  const [showApiKey, setShowApiKey] = useState(false);

  return (
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
  );
}
