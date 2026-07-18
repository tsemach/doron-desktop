const AUDIO_CAPABLE_PROVIDERS = ["gemini", "openai"];

interface SettingVoiceEngineProps {
  voiceEngine: string;
  setVoiceEngine: (val: string) => void;
  aiProvider: string;
}

export default function SettingVoiceEngine({
  voiceEngine,
  setVoiceEngine,
  aiProvider,
}: SettingVoiceEngineProps) {
  const supportsAudio = AUDIO_CAPABLE_PROVIDERS.includes(aiProvider);

  return (
    <div data-testid="voice-engine-setting" className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div>
        <h3 className="text-sm font-bold text-foreground">Voice Input Engine</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Choose how spoken field input (e.g. in New Case or Document Details) is transcribed. Independent of the AI provider above.
        </p>
      </div>

      <div className="inline-flex rounded-md border border-input overflow-hidden">
        {(["local", "cloud"] as const).map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setVoiceEngine(opt)}
            className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
              opt !== "local" ? "border-l border-input" : ""
            } ${
              voiceEngine === opt
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>

      {voiceEngine === "local" ? (
        <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
          Runs fully offline via a local speech-to-text model — no audio leaves this device. Model download &amp; setup is coming soon.
        </p>
      ) : supportsAudio ? (
        <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
          Uses your configured {aiProvider} account to transcribe voice input.
        </p>
      ) : (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-900/40 rounded-lg px-3 py-2">
          Your configured provider ({aiProvider || "none"}) doesn't support audio transcription. Voice input will be disabled until you switch your AI provider above to Gemini or OpenAI.
        </p>
      )}
    </div>
  );
}
