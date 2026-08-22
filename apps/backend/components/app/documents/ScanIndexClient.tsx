"use client";

import { useEffect, useRef, useState } from "react";
import { Folder, FileText, Loader2, RotateCw } from "lucide-react";
import { useLanguage } from "../../../context/LanguageContext";
import { ensureReadPermission, saveFileHandle } from "../../../lib/documents/localHandles";
import { collectFiles, processGlobalScan, registerSingleFile, type GlobalScanEvent } from "../../../lib/documents/scanning";
import type { DocumentRow } from "../../../lib/documents/crud";

type LogEntry = { fileName: string; message: string; ok: boolean };
type Stage = "idle" | "confirm" | "progress";

// Mirrors desktop's DocsManagementScan.tsx: a case-less global index, no
// case selector -- documents registered here have no caseId (see
// documents.caseId in packages/backend-orm/src/schema.ts). A case's own
// Documents tab (CaseDocumentsPanel) is a separate, still case-scoped
// feature and untouched by this page.
export default function ScanIndexClient() {
  const { t } = useLanguage();
  const [stage, setStage] = useState<Stage>("idle");
  const [pickedHandle, setPickedHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [forceReindex, setForceReindex] = useState(false);

  const [files, setFiles] = useState<{ relativePath: string; fileHandle: FileSystemFileHandle }[]>([]);
  const [processedCount, setProcessedCount] = useState(0);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  const [singleFileStatus, setSingleFileStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Matches CaseDocumentsPanel's SSR-safe pattern: computed after mount,
  // not inline during render, so server and first-client-render markup
  // agree (avoids a hydration mismatch on the window-only check below).
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setSupported("showDirectoryPicker" in window);
  }, []);

  async function handlePickFolder() {
    setError(null);
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      setPickedHandle(handle);
      setForceReindex(false);
      setStage("confirm");
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(t("documents_connect_error"));
      }
    }
  }

  function handleCancelConfirm() {
    setPickedHandle(null);
    setStage("idle");
  }

  async function handleStartIndexing() {
    if (!pickedHandle) return;
    setError(null);
    setLog([]);
    setProcessedCount(0);
    setCurrentFileName(null);
    stopRef.current = false;

    const collected = await collectFiles(pickedHandle);
    setFiles(collected);
    setStage("progress");
    setRunning(true);

    const existingByPath = new Map<string, string>();
    const res = await fetch("/api/v1/documents");
    if (res.ok) {
      const data = await res.json();
      for (const doc of data.documents as DocumentRow[]) {
        existingByPath.set(doc.relativePath, doc.id);
      }
    }

    for await (const event of processGlobalScan(collected, existingByPath, forceReindex)) {
      if (stopRef.current) break;
      setCurrentFileName(event.fileName);
      setProcessedCount((n) => n + 1);
      setLog((prev) => [...prev, describeEvent(event)]);
    }

    setCurrentFileName(null);
    setRunning(false);
  }

  function handleStop() {
    stopRef.current = true;
  }

  function handleCloseProgress() {
    stopRef.current = true;
    setStage("idle");
    setPickedHandle(null);
    setFiles([]);
  }

  async function handleIndexSingleFile() {
    setError(null);
    setSingleFileStatus(null);
    try {
      const [fileHandle] = await window.showOpenFilePicker({ multiple: false });
      if (!(await ensureReadPermission(fileHandle))) return;
      const document = await registerSingleFile(fileHandle);
      if (!document) {
        setError(t("documents_connect_error"));
        return;
      }
      await saveFileHandle(document.id, fileHandle);
      setSingleFileStatus(`Indexed "${document.fileName}".`);
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(t("documents_connect_error"));
      }
    }
  }

  if (supported === false) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <p className="max-w-md text-center text-sm text-muted-foreground">{t("documents_unsupported_browser")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 px-6 py-10">
      <div className="max-w-3xl mx-auto text-center mb-8">
        <h2 className="text-2xl font-bold text-foreground">Index Documents for AI Search</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect local files or folders. Ascurix will parse text, extract metadata keywords, and generate vector embeddings for
          intelligent semantic search.
        </p>
      </div>

      {stage === "idle" && (
        <div className="max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <Folder className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Index Entire Folder</h3>
            <p className="text-xs text-muted-foreground flex-1">
              Recursively scans a directory for PDF, DOCX, TXT, and Excel sheets. Perfect for importing legal archives.
            </p>
            <button onClick={handlePickFolder} className="text-sm font-medium text-primary hover:underline text-left">
              Choose Directory →
            </button>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 flex flex-col gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Index Single Document</h3>
            <p className="text-xs text-muted-foreground flex-1">
              Select a single document to index. Ideal for quick updates or testing formatting.
            </p>
            <button onClick={handleIndexSingleFile} className="text-sm font-medium text-primary hover:underline text-left">
              Choose File →
            </button>
            {singleFileStatus && <p className="text-xs text-muted-foreground">{singleFileStatus}</p>}
          </div>
        </div>
      )}

      {stage === "confirm" && pickedHandle && (
        <div className="max-w-2xl mx-auto rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Folder selected</p>
          <p className="text-sm font-semibold text-foreground mb-1">{pickedHandle.name}</p>
          <p className="text-xs text-muted-foreground mb-4">
            Browsers don&apos;t expose a folder&apos;s full local path -- only its own name is shown here.
          </p>

          <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm cursor-pointer">
            <input type="checkbox" checked={forceReindex} onChange={(e) => setForceReindex(e.target.checked)} />
            Force re-index / override already processed documents
          </label>

          <div className="flex justify-end gap-2 mt-4">
            <button onClick={handleCancelConfirm} className="h-9 px-4 rounded-md border border-border text-sm font-medium hover:bg-muted">
              Cancel
            </button>
            <button
              onClick={handleStartIndexing}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            >
              Start Indexing
            </button>
          </div>
        </div>
      )}

      {stage === "progress" && pickedHandle && (
        <div className="max-w-2xl mx-auto rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Directory sync</p>
              <p className="text-sm font-semibold text-foreground">{pickedHandle.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                Files: {processedCount} / {files.length}
              </span>
              {running ? (
                <button onClick={handleStop} className="h-8 px-3 rounded-md border border-destructive/40 text-destructive text-xs font-medium hover:bg-destructive/10">
                  Stop
                </button>
              ) : null}
              <button onClick={handleCloseProgress} className="h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-muted">
                {running ? "Cancel" : "Close"}
              </button>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-muted-foreground">Overall progress</p>
              <p className="text-xs font-medium text-muted-foreground">
                {files.length === 0 ? 0 : Math.round((processedCount / files.length) * 100)}%
              </p>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${files.length === 0 ? 0 : (processedCount / files.length) * 100}%` }}
              />
            </div>
          </div>

          {currentFileName && (
            <div className="mb-4 flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">{currentFileName}</p>
                <p className="text-xs text-muted-foreground">indexing…</p>
              </div>
            </div>
          )}

          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Indexing log output</p>
          <div className="max-h-64 overflow-y-auto rounded-md bg-muted/40 p-2 flex flex-col gap-1">
            {log.length === 0 && <p className="text-xs text-muted-foreground px-1 py-1">No files processed yet.</p>}
            {[...log].reverse().map((entry, i) => (
              <div key={i} className="text-xs px-1 py-0.5">
                <span className={entry.ok ? "text-emerald-600" : "text-muted-foreground"}>{entry.ok ? "✓" : "–"}</span>{" "}
                <span className="font-medium text-foreground">{entry.fileName}</span>{" "}
                <span className="text-muted-foreground">{entry.message}</span>
              </div>
            ))}
          </div>

          {!running && files.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
              <RotateCw className="h-3 w-3" />
              {stopRef.current && processedCount < files.length ? "Stopped." : "Done."}
            </p>
          )}
        </div>
      )}

      <div className="max-w-3xl mx-auto mt-6 text-center">{error && <p className="text-sm text-destructive">{error}</p>}</div>
    </div>
  );
}

function describeEvent(event: GlobalScanEvent): LogEntry {
  if (event.type === "skipped") {
    return { fileName: event.fileName, message: "already indexed — skipped", ok: false };
  }
  if (event.type === "failed") {
    return { fileName: event.fileName, message: "failed to register", ok: false };
  }
  return { fileName: event.fileName, message: event.searchable ? "indexed for search" : "registered (not searchable — only .txt is indexed)", ok: true };
}
