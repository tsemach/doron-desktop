import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { startRecording as pluginStartRecording, stopRecording as pluginStopRecording } from "tauri-plugin-mic-recorder-api";
import { Button } from "./button";

type RecordingState = "idle" | "recording" | "error";

interface VoiceFieldInputProps {
  /** Called with the recorded audio once a recording finishes, as a WAV blob
   * (the plugin always writes WAV) — further conversion, if needed, is a
   * concern for the transcription phase that consumes this, not this component. */
  onRecordingComplete?: (blob: Blob) => void;
  maxDurationMs?: number;
  className?: string;
  /** When true, the mic button is non-interactive — e.g. cloud voice engine
   * selected but the configured AI provider doesn't support audio (see
   * lib/voiceCapability.ts). */
  disabled?: boolean;
  /** Tooltip shown while disabled, explaining why. */
  disabledTitle?: string;
  /** Called when the user clears the recording preview (the "x" button) —
   * lets a parent pipeline (e.g. VoiceFieldFiller) discard any in-flight
   * transcribe/extract result for this recording instead of still showing
   * it once it resolves. */
  onReset?: () => void;
}

const DEFAULT_MAX_DURATION_MS = 15000;

export default function VoiceFieldInput({
  onRecordingComplete,
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
  className = "",
  disabled = false,
  disabledTitle,
  onReset,
}: VoiceFieldInputProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastRecordingUrl, setLastRecordingUrl] = useState<string | null>(null);
  const [lastRecordingInfo, setLastRecordingInfo] = useState<{ sizeKb: number; durationMs: number } | null>(null);

  const startTimeRef = useRef(0);
  const timerIntervalRef = useRef<number | null>(null);
  const maxDurationTimeoutRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  // Mirrors `state === "recording"` in a ref so the unmount cleanup (a stale
  // closure from mount) can still see the live value.
  const isRecordingRef = useRef(false);

  function clearTimers() {
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (maxDurationTimeoutRef.current !== null) {
      window.clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }
  }

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearTimers();
      // If a recording is still active when this component unmounts (e.g.
      // the user navigates away without clicking to stop, or a dev-mode
      // hot-reload swaps this component out), the native plugin's stream
      // stays open and its internal "is_recording" flag stays stuck true
      // forever — permanently blocking any future recording until the app
      // process restarts. Stop it here so that can't happen; the blob (if
      // any) is discarded since there's no mounted consumer left.
      if (isRecordingRef.current) {
        pluginStopRecording().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (lastRecordingUrl) URL.revokeObjectURL(lastRecordingUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRecordingUrl]);

  // Captures audio natively via tauri-plugin-mic-recorder (cpal), not the
  // browser's getUserMedia — WebView2 on Windows has no reliable permission
  // story for getUserMedia, so mic access instead goes through the OS's
  // native audio APIs (WASAPI/CoreAudio/ALSA), gated only by the OS-level
  // microphone privacy setting rather than a per-webview browser prompt.
  async function stopRecording() {
    clearTimers();
    isRecordingRef.current = false;
    if (isMountedRef.current) setState("idle");
    try {
      const durationMs = Date.now() - startTimeRef.current;
      const savePath = await pluginStopRecording();
      const bytes = await invoke<number[]>("read_file_bytes", { path: savePath });
      const blob = new Blob([new Uint8Array(bytes)], { type: "audio/wav" });
      if (!isMountedRef.current) return;
      setLastRecordingUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setLastRecordingInfo({ sizeKb: Math.round((blob.size / 1024) * 10) / 10, durationMs });
      onRecordingComplete?.(blob);
    } catch (err) {
      console.error("Failed to stop voice recording:", err);
      if (isMountedRef.current) {
        setError(`Could not save the recording: ${String(err)}`);
        setState("error");
      }
    }
  }

  async function startRecording() {
    setError(null);
    try {
      await pluginStartRecording();

      startTimeRef.current = Date.now();
      isRecordingRef.current = true;
      setState("recording");
      setElapsedMs(0);

      timerIntervalRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startTimeRef.current);
      }, 100);

      maxDurationTimeoutRef.current = window.setTimeout(() => {
        stopRecording();
      }, maxDurationMs);
    } catch (err) {
      console.error("Failed to start voice recording:", err);
      setError(`Could not access the microphone: ${String(err)}`);
      setState("error");
      clearTimers();
    }
  }

  function handleToggle() {
    if (disabled) return;
    if (state === "recording") {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function handleResetRecording() {
    setLastRecordingUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setLastRecordingInfo(null);
    setError(null);
    onReset?.();
  }

  // Force-resets everything, including the native plugin's own internal
  // "is_recording" flag — that flag lives in a Rust static and can get
  // stuck true (e.g. a dev hot-reload, or a start/stop call racing with a
  // crash) with no way to clear it except restarting the whole app. Calling
  // stop_recording unconditionally clears it even when nothing is actually
  // recording client-side; the "No recording in progress" error that comes
  // back in that case is expected and safely ignored.
  async function handleForceReset() {
    clearTimers();
    isRecordingRef.current = false;
    try {
      await pluginStopRecording();
    } catch {
      // Expected when nothing was actually recording — the goal here is
      // just to clear any stuck native-side state, not to capture audio.
    }
    if (!isMountedRef.current) return;
    setState("idle");
    setError(null);
    setElapsedMs(0);
    setLastRecordingUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setLastRecordingInfo(null);
    onReset?.();
  }

  const elapsedSeconds = (elapsedMs / 1000).toFixed(1);
  const buttonTitle = disabled
    ? disabledTitle || "Voice input unavailable"
    : state === "recording"
      ? "Stop recording"
      : "Record voice input";

  return (
    <div className={`inline-flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={state === "recording" ? "destructive" : "outline"}
          size="icon-sm"
          onClick={handleToggle}
          disabled={disabled}
          title={buttonTitle}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="8" y1="22" x2="16" y2="22" />
          </svg>
        </Button>

        {state === "recording" && (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-destructive select-none">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
            </span>
            Recording... {elapsedSeconds}s
          </span>
        )}

        {error && (
          <>
            <span className="text-[11px] text-destructive">{error}</span>
            <button
              type="button"
              onClick={handleForceReset}
              title="Reset voice input (clears a stuck recording state)"
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5 rounded hover:bg-muted shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" />
                <path d="M3 21v-5h5" />
              </svg>
            </button>
          </>
        )}
      </div>

      {lastRecordingUrl && lastRecordingInfo && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={lastRecordingUrl} className="h-7 max-w-[220px]" />
          <span>
            {(lastRecordingInfo.durationMs / 1000).toFixed(1)}s · {lastRecordingInfo.sizeKb}KB
          </span>
          <button
            type="button"
            onClick={handleResetRecording}
            title="Clear recording"
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5 rounded hover:bg-muted"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
