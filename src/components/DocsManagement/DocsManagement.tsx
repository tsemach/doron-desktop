import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Button } from "../ui/button";
import { API_KEY_STORAGE_KEY } from "../Settings/Settings";
import DocsManagementPicker from "./DocsManagementPicker";
import BackButton from "../ui/back-button";

type ProgressStatus = "processing" | "ok" | "skipped" | "failed";

type ProgressItem = {
  file_name: string;
  status: ProgressStatus;
  message: string;
  current: number;
  total: number;
};

type IndexSummary = {
  indexed: number;
  skipped: number;
  failed: number;
};

type IndexProgressEvent = {
  file_name: string;
  status: string;
  message: string;
  current: number;
  total: number;
};

function StatusIcon({ status }: { status: ProgressStatus }) {
  if (status === "processing") {
    return <span className="inline-block animate-spin text-muted-foreground">⟳</span>;
  }
  if (status === "ok") return <span className="text-green-500">✓</span>;
  if (status === "failed") return <span className="text-red-500">✗</span>;
  return <span className="text-muted-foreground">─</span>;
}

export default function DocsManagement() {
  const navigate = useNavigate();
  const [showPicker, setShowPicker] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPath, setSelectedPath] = useState("");
  const [isFolder, setIsFolder] = useState(false);
  const [items, setItems] = useState<ProgressItem[]>([]);
  const [summary, setSummary] = useState<IndexSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
  const [dbPath, setDbPath] = useState("");

  useEffect(() => {
    invoke<string>("get_db_path").then(setDbPath).catch(() => {});
  }, []);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [items]);

  useEffect(() => {
    return () => { unlistenRef.current?.(); };
  }, []);

  async function startIndexing(path: string, folder: boolean) {
    setSelectedPath(path);
    setIsFolder(folder);
    setShowOutput(true);
    setItems([]);
    setSummary(null);
    setError(null);
    setIsProcessing(true);

    unlistenRef.current = await listen<IndexProgressEvent>("indexing-progress", (event) => {
      const { file_name, status, message, current, total } = event.payload;
      setItems((prev) => {
        const idx = prev.findIndex((p) => p.file_name === file_name);
        const item: ProgressItem = {
          file_name,
          status: status as ProgressStatus,
          message,
          current,
          total,
        };
        if (idx === -1) return [...prev, item];
        const next = [...prev];
        next[idx] = item;
        return next;
      });
    });

    try {
      const result = folder
        ? await invoke<IndexSummary>("index_folder", { folderPath: path, apiKey })
        : await invoke<IndexSummary>("index_file", { filePath: path, apiKey });
      setSummary(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
      unlistenRef.current?.();
      unlistenRef.current = null;
    }
  }

  const currentItem = items.find((i) => i.status === "processing");
  const progress = currentItem ? `[${currentItem.current} / ${currentItem.total}]` : "";

  return (
    <div className="flex-1 p-4">
      <div className="relative flex items-center mb-4">
        <BackButton navigateTo={-1} />
        <h1 className="absolute left-1/2 -translate-x-1/2 text-2xl font-bold">Documents Management</h1>
      </div>

      {!apiKey && (
        <div className="mb-4 rounded-md border border-yellow-400 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
          No API key set —{" "}
          <button className="underline font-medium" onClick={() => navigate("/settings")}>
            go to Settings
          </button>{" "}
          to add your Claude API key before scanning.
        </div>
      )}

      <div className="flex items-center gap-4">
        <div className="relative inline-block">
          <Button
            disabled={!apiKey || isProcessing}
            onClick={() => setShowPicker((v) => !v)}
            className="flex items-center gap-2"
          >
            Scan Documents
          </Button>
          <DocsManagementPicker
            show={showPicker}
            onClose={() => setShowPicker(false)}
            onSelect={startIndexing}
          />
        </div>
        {dbPath && (
          <p className="text-xs text-muted-foreground font-mono">DB: {dbPath}</p>
        )}
        {isFolder && isProcessing && currentItem && (
          <span className="text-sm text-muted-foreground">
            {currentItem.current} / {currentItem.total}
          </span>
        )}
      </div>

      {showOutput && (
        <div className="mt-4 rounded-md border bg-muted/40 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/60">
            <span className="text-sm font-medium truncate max-w-[80%]">
              {isFolder ? "Indexing folder: " : "Indexing: "}
              <span className="font-mono text-xs">{selectedPath}</span>
            </span>
            {isProcessing && progress && (
              <span className="text-xs text-muted-foreground font-mono">{progress}</span>
            )}
          </div>

          {currentItem && (
            <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/60 font-mono text-sm">
              <span className="inline-block animate-spin text-muted-foreground w-4 shrink-0 text-center">⟳</span>
              <span className="truncate text-foreground">{currentItem.file_name}</span>
              <span className="text-muted-foreground text-xs shrink-0">{currentItem.message}</span>
            </div>
          )}

          <div
            ref={outputRef}
            className="max-h-80 overflow-y-auto px-4 py-2 space-y-1 font-mono text-sm"
          >
            {items.length === 0 && isProcessing && (
              <p className="text-muted-foreground text-xs">Starting...</p>
            )}
            {items.filter((i) => i.status !== "processing").map((item) => (
              <div key={item.file_name} className="flex items-start gap-3">
                <span className="mt-0.5 w-4 shrink-0 text-center">
                  <StatusIcon status={item.status} />
                </span>
                <span className="w-56 shrink-0 truncate text-foreground">{item.file_name}</span>
                <span className="text-muted-foreground truncate">{item.message}</span>
              </div>
            ))}
            {error && (
              <p className="text-red-500 text-xs mt-2">Error: {error}</p>
            )}
          </div>

          {summary && (
            <div className="border-t px-4 py-2 text-xs text-muted-foreground">
              Done: {summary.indexed} indexed · {summary.skipped} skipped · {summary.failed} failed
            </div>
          )}
        </div>
      )}
    </div>
  );
}
