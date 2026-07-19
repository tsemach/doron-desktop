import { X } from "lucide-react";

interface SettingVoiceEngineHelpProps {
  onClose: () => void;
  voiceEngine?: string;
  voiceModel?: string;
}

export default function SettingVoiceEngineHelp({
  onClose,
  voiceEngine,
  voiceModel,
}: SettingVoiceEngineHelpProps) {
  const isSelected = (engine: string) => voiceEngine === engine;

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
        {/* 1. Local */}
        <div className="space-y-1.5 pb-4 border-b border-border/60">
          <p className="font-semibold text-foreground">1. Local (offline)</p>
          <p>
            Transcribes your voice completely on this device using a local speech-to-text model — no audio ever leaves your machine, and it works without an internet connection. Requires downloading a model once, and uses a bit more disk space and CPU during transcription.
          </p>

          {isSelected("local") && (
            <div className="text-[11px] leading-relaxed text-muted-foreground bg-muted/40 p-2.5 rounded-xl border border-border/50 mt-2 space-y-1.5">
              <p className="font-bold text-foreground">Model choice:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <strong>Hebrew (ivrit-ai, large-v3-turbo):</strong> a Whisper fine-tune specialized for Hebrew speech — noticeably more accurate for Hebrew, less reliable for other languages.
                </li>
                <li>
                  <strong>Multilingual (small, faster):</strong> the standard multilingual Whisper model — handles English and Hebrew reasonably, downloads faster and runs lighter.
                </li>
              </ul>
              {voiceModel && (
                <p className="pt-1">
                  Currently selected: <span className="font-semibold text-foreground">{voiceModel}</span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* 2. Cloud */}
        <div className="space-y-1.5 pb-4 border-b border-border/60">
          <p className="font-semibold text-foreground">2. Cloud</p>
          <p>
            Sends the recorded audio to your configured AI provider's transcription API. Faster to set up (no download) and typically higher accuracy, but audio leaves your device and requires an internet connection. Only Gemini and OpenAI support audio transcription — if your configured AI provider is Claude, or a mock/unset setup, voice input is disabled until you switch providers above.
          </p>
        </div>

        <div className="space-y-1.5 pt-1">
          <p className="font-semibold text-foreground">Which should I use?</p>
          <p>
            If you're working with sensitive documents and want everything to stay on-device, use Local. If you already have a working Gemini or OpenAI key configured above and want the simplest setup, use Cloud.
          </p>
        </div>
      </div>
    </div>
  );
}
