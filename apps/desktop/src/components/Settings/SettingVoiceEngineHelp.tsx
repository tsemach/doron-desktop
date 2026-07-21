import { X } from "lucide-react";

interface SettingVoiceEngineHelpProps {
  onClose: () => void;
}

export default function SettingVoiceEngineHelp({
  onClose,
}: SettingVoiceEngineHelpProps) {
  return (
    <div className="space-y-5 animate-fade-in relative">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-0 right-0 text-muted-foreground hover:text-foreground cursor-pointer"
        aria-label="Close help"
      >
        <X className="size-4" />
      </button>

      <h3 className="font-bold text-sm tracking-tight text-foreground flex items-center gap-1.5 pt-0.5 border-b border-border/60 pb-2">
        Voice Input Engine Guide
      </h3>

      <div className="text-xs text-muted-foreground space-y-4 leading-relaxed">
        <div className="space-y-1.5 pb-4 border-b border-border/60">
          <p className="font-semibold text-foreground">How it works</p>
          <p>
            Sends the recorded audio to your configured cloud provider's transcription API. Only Gemini and OpenAI support audio transcription — the provider selected here is independent of the main AI Provider (LLM) setting, so that one can stay on a different provider while voice uses whichever of the two has audio support.
          </p>
        </div>

        <div className="space-y-1.5 pt-1">
          <p className="font-semibold text-foreground">Setup</p>
          <p>
            Add an API key for your chosen provider above, then use Run Health Check to confirm it's working before relying on it in New Case or Document Details.
          </p>
        </div>
      </div>
    </div>
  );
}
