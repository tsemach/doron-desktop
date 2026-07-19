import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import VoiceFieldInput from "./VoiceFieldInput";
import { Button } from "./button";
import { checkVoiceCapability } from "@/lib/voiceCapability";
import { blobToWav16kMono } from "@/lib/audioConversion";
import { API_KEY_STORAGE_KEY } from "@/components/Settings/Settings";

interface VoiceFieldFillerProps {
  /** Every field name the user could plausibly be referring to — passed to
   * extract_field_value so it can't return a field that doesn't exist here. */
  availableFields: string[];
  /** Called once the user confirms the detected field/value. */
  onFieldExtracted: (field: string, value: string) => void;
}

type PipelineState =
  | { status: "idle" }
  | { status: "processing" }
  | { status: "confirm"; transcript: string; field: string | null; value: string | null }
  | { status: "error"; message: string };

interface AiSettings {
  ai_mode?: string;
  provider?: string;
  ai_model?: string;
  api_key_enc?: string;
  voice_engine?: string;
  voice_model?: string;
  voice_cloud_provider?: string;
  voice_cloud_api_key?: string;
  voice_cloud_model?: string;
}

/**
 * Mic button + the full record -> transcribe (local or cloud, per the
 * voice-input-engine setting) -> extract field/value -> confirm pipeline.
 * Shared across every field-editing screen that wants voice input — the
 * transcript is always shown for confirmation before onFieldExtracted is
 * called, since transcription errors (especially proper nouns) are the
 * dominant accuracy risk, not extraction.
 */
export default function VoiceFieldFiller({ availableFields, onFieldExtracted }: VoiceFieldFillerProps) {
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [pipeline, setPipeline] = useState<PipelineState>({ status: "idle" });
  // Tauri's invoke() has no cancel token, so an in-flight transcribe/extract
  // call can't be aborted server-side once started — this flag just makes
  // the UI discard the result instead of showing it once it resolves.
  const cancelledRef = useRef(false);

  useEffect(() => {
    invoke<AiSettings>("get_ai_settings").then(setAiSettings).catch(() => {});
  }, []);

  const capability = checkVoiceCapability(aiSettings);

  function handleCancelPipeline() {
    cancelledRef.current = true;
    setPipeline({ status: "idle" });
  }

  async function handleRecordingComplete(blob: Blob) {
    cancelledRef.current = false;
    setPipeline({ status: "processing" });
    try {
      const voiceEngine = aiSettings?.voice_engine || "local";

      let transcript: string;
      // Extraction's provider override — only set for the cloud engine, so
      // the local engine keeps using the normal active-provider resolution
      // (unchanged) for field extraction.
      let extractionProvider: string | undefined;
      let extractionApiKey = "";
      let extractionModel: string | undefined;

      if (voiceEngine === "local") {
        const wav = await blobToWav16kMono(blob);
        const audioBytes = Array.from(new Uint8Array(await wav.arrayBuffer()));
        transcript = await invoke<string>("transcribe_audio_local", {
          audioBytes,
          modelName: aiSettings?.voice_model || "whisper multilingual (small)",
          language: null,
        });
        const fallbackApiKey = localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
        extractionApiKey = aiSettings?.api_key_enc || fallbackApiKey;
      } else {
        // Cloud engine: both transcription AND extraction use the dedicated
        // voice-cloud provider/key, independent of the main AI Provider
        // setting (which may be on local mode for chat/other features).
        const cloudProvider = aiSettings?.voice_cloud_provider || "gemini";
        const cloudApiKey = aiSettings?.voice_cloud_api_key || "";
        const cloudModel = aiSettings?.voice_cloud_model || "gemini-3.5-flash";
        const audioBytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
        transcript = await invoke<string>("transcribe_audio_cloud", {
          audioBytes,
          apiKey: cloudApiKey,
          model: cloudModel,
          language: null,
          provider: cloudProvider,
        });
        extractionProvider = cloudProvider;
        extractionApiKey = cloudApiKey;
        extractionModel = cloudModel;
      }

      if (cancelledRef.current) return;

      if (!transcript.trim()) {
        setPipeline({ status: "error", message: "No speech detected — try again." });
        return;
      }

      const extraction = await invoke<{ field: string | null; value: string | null }>("extract_field_value", {
        text: transcript,
        availableFields,
        apiKey: extractionApiKey,
        model: extractionModel,
        provider: extractionProvider,
      });

      if (cancelledRef.current) return;

      setPipeline({ status: "confirm", transcript, field: extraction.field, value: extraction.value });
    } catch (err) {
      if (cancelledRef.current) return;
      setPipeline({ status: "error", message: String(err) });
    }
  }

  function handleConfirm() {
    if (pipeline.status === "confirm" && pipeline.field && pipeline.value) {
      onFieldExtracted(pipeline.field, pipeline.value);
    }
    setPipeline({ status: "idle" });
  }

  return (
    <div className="relative inline-flex items-center gap-2">
      <VoiceFieldInput
        onRecordingComplete={handleRecordingComplete}
        onReset={handleCancelPipeline}
        disabled={capability.disabled || pipeline.status === "processing"}
        disabledTitle={capability.reason ?? undefined}
      />

      {pipeline.status === "processing" && (
        <span className="text-[11px] text-muted-foreground animate-pulse select-none">Processing...</span>
      )}

      {pipeline.status === "error" && (
        <div className="absolute top-full left-0 mt-1 z-20 w-72 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-400 shadow-lg animate-fade-in">
          {pipeline.message}
          <button
            type="button"
            onClick={() => setPipeline({ status: "idle" })}
            className="block mt-1.5 font-semibold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {pipeline.status === "confirm" && (
        <div className="absolute top-full left-0 mt-1 z-20 w-80 rounded-lg border border-border bg-card p-3 text-xs shadow-lg space-y-2 animate-fade-in">
          <div>
            <span className="font-semibold text-foreground">Heard:</span>{" "}
            <span className="text-muted-foreground italic">&ldquo;{pipeline.transcript}&rdquo;</span>
          </div>

          {pipeline.field && pipeline.value ? (
            <div className="rounded-md bg-muted/50 px-2 py-1.5">
              <span className="font-semibold text-foreground">{pipeline.field}</span>
              <span className="text-muted-foreground"> &rarr; </span>
              <span className="text-foreground">{pipeline.value}</span>
            </div>
          ) : (
            <div className="text-amber-600 dark:text-amber-400">
              Couldn't match this to any field. Try mentioning the field name more clearly.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" className="h-6 text-xs" onClick={() => setPipeline({ status: "idle" })}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-6 text-xs"
              disabled={!pipeline.field || !pipeline.value}
              onClick={handleConfirm}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
