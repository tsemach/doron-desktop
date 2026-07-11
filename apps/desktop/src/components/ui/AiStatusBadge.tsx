import { useState } from "react";
import { createPortal } from "react-dom";
import { useAtom, useAtomValue, getDefaultStore } from "jotai";
import { aiConfigAtom, aiConfigStatusAtom, triggerGlobalHealthCheck } from "../../store/aiStore";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";

export default function AiStatusBadge() {
  const [status, setStatus] = useAtom(aiConfigStatusAtom);
  const config = useAtomValue(aiConfigAtom);
  const [isOpen, setIsOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isVerified = status === "verified";

  const handleStart = async () => {
    setIsStarting(true);
    setErrorMessage(null);
    try {
      await triggerGlobalHealthCheck();
      const currentStatus = getDefaultStore().get(aiConfigStatusAtom);
      if (currentStatus === "verified") {
        setIsOpen(false);
      } else {
        setErrorMessage("Connection failed. Please check your AI configurations.");
      }
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    try {
      if (config?.aiMode === "local") {
        await invoke("stop_llama_server");
      }
      setStatus("failed");
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to stop AI server:", err);
    }
  };

  return (
    <>
      {/* Badge Button */}
      <button
        onClick={() => {
          setErrorMessage(null);
          setIsOpen(true);
        }}
        className={`flex items-center gap-1.5 border rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200 hover:scale-102 hover:shadow-xs active:scale-98 cursor-pointer ${
          isVerified
            ? "bg-green-50/60 border-green-200 text-green-700 hover:bg-green-100/60"
            : status === "idle"
            ? "bg-muted border-border/80 text-muted-foreground hover:bg-muted/80"
            : "bg-red-50/60 border-red-200 text-red-700 hover:bg-red-100/60"
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isVerified
              ? "bg-green-500"
              : status === "idle"
              ? "bg-muted-foreground/60"
              : "bg-red-500 animate-ping"
          }`}
        />
        <span>{isVerified ? "AI Connected" : "API Offline"}</span>
      </button>

      {/* Connection Controller Modal */}
      {isOpen && createPortal(
        <div className="fixed inset-0 bg-black/55 backdrop-blur-[2px] flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-card border border-border rounded-xl shadow-lg max-w-sm w-full mx-4 overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-border/60 bg-muted/30 flex items-center gap-3">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-sm ${
                  isVerified
                    ? "bg-green-100 text-green-600"
                    : "bg-red-100 text-red-600"
                }`}
              >
                {isVerified ? "✓" : "⚠️"}
              </span>
              <div>
                <h3 className="text-xs font-bold text-foreground">
                  AI Connection Status
                </h3>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {isVerified
                  ? "AI is running. Connection is active and ready to process requests."
                  : "AI is offline. Please start the service to enable smart search and vector indexing."}
              </p>
              {config && (
                <div className="bg-muted/30 border border-border/40 rounded-lg p-3 text-[10px] font-mono space-y-1 text-muted-foreground">
                  <div><span className="font-semibold text-foreground">Mode:</span> {config.aiMode}</div>
                  <div><span className="font-semibold text-foreground">Provider:</span> {config.provider}</div>
                  <div><span className="font-semibold text-foreground">Model:</span> {config.aiModel}</div>
                </div>
              )}
              {errorMessage && (
                <div className="bg-red-50 border border-red-100 text-red-700 text-[10px] rounded-lg p-2.5 leading-relaxed font-mono">
                  {errorMessage}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-5 py-3.5 bg-muted/20 border-t border-border/60 flex items-center justify-end gap-2.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold"
                onClick={() => setIsOpen(false)}
                disabled={isStarting}
              >
                Close
              </Button>
              {isVerified ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8 text-xs font-semibold bg-red-600 hover:bg-red-750 text-white animate-fade-in"
                  onClick={handleStop}
                >
                  Stop
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-8 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white min-w-[70px] animate-fade-in"
                  onClick={handleStart}
                  disabled={isStarting}
                >
                  {isStarting ? "Starting..." : "Start"}
                </Button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
