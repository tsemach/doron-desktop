import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "./button";

type RecordingState = "idle" | "recording" | "error";

interface VoiceFieldInputProps {
  /** Called with the recorded audio once a recording finishes. Raw MediaRecorder
   * output (typically audio/webm) — format conversion, if needed, is a concern
   * for the transcription phase that consumes this, not this component. */
  onRecordingComplete?: (blob: Blob) => void;
  maxDurationMs?: number;
  className?: string;
}

const DEFAULT_MAX_DURATION_MS = 15000;

export default function VoiceFieldInput({
  onRecordingComplete,
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
  className = "",
}: VoiceFieldInputProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [lastRecordingUrl, setLastRecordingUrl] = useState<string | null>(null);
  const [lastRecordingInfo, setLastRecordingInfo] = useState<{ sizeKb: number; durationMs: number } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const timerIntervalRef = useRef<number | null>(null);
  const maxDurationTimeoutRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (maxDurationTimeoutRef.current !== null) {
      window.clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanupStream();
    };
  }, [cleanupStream]);

  useEffect(() => {
    return () => {
      if (lastRecordingUrl) URL.revokeObjectURL(lastRecordingUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastRecordingUrl]);

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (isMountedRef.current) setState("idle");
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const durationMs = Date.now() - startTimeRef.current;
        cleanupStream();
        if (!isMountedRef.current) return;
        setLastRecordingUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        setLastRecordingInfo({ sizeKb: Math.round((blob.size / 1024) * 10) / 10, durationMs });
        onRecordingComplete?.(blob);
      };

      startTimeRef.current = Date.now();
      recorder.start();
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
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access denied. Allow microphone access to use voice input."
          : "Could not access the microphone."
      );
      setState("error");
      cleanupStream();
    }
  }

  function handleToggle() {
    if (state === "recording") {
      stopRecording();
    } else {
      startRecording();
    }
  }

  const elapsedSeconds = (elapsedMs / 1000).toFixed(1);

  return (
    <div className={`inline-flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={state === "recording" ? "destructive" : "outline"}
          size="icon-sm"
          onClick={handleToggle}
          title={state === "recording" ? "Stop recording" : "Record voice input"}
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

        {error && <span className="text-[11px] text-destructive">{error}</span>}
      </div>

      {lastRecordingUrl && lastRecordingInfo && (
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={lastRecordingUrl} className="h-7 max-w-[220px]" />
          <span>
            {(lastRecordingInfo.durationMs / 1000).toFixed(1)}s · {lastRecordingInfo.sizeKb}KB
          </span>
        </div>
      )}
    </div>
  );
}
