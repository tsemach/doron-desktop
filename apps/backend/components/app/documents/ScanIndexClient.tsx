"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Folder, FileText, Loader2 } from "lucide-react";
import { useLanguage } from "../../../context/LanguageContext";
import {
  clearScanSession,
  ensureReadPermission,
  getScanSession,
  saveFileHandle,
  saveScanSession,
  type ScanSessionRecord,
} from "../../../lib/documents/localHandles";
import { collectFiles, processGlobalScan, registerSingleFile, type GlobalScanEvent } from "../../../lib/documents/scanning";
import type { DocumentRow } from "../../../lib/documents/crud";

// "skipped"/"failed" are distinguished (not both folded into a single
// `ok: false`) so ScanFooter's Indexed/Skipped/Failed counts -- mirroring
// desktop's ScanFooter.tsx -- can be computed straight from the log.
type LogStatus = "indexed" | "skipped" | "failed";
type LogEntry = { fileName: string; message: string; status: LogStatus };
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
  // Set only by Cancel (discard entirely), never by Stop (pause/resumable)
  // -- lets runScan's post-loop cleanup tell the two apart, since both set
  // stopRef to break the loop. Without this, a Cancel clicked mid-run
  // raced against the in-flight loop noticing stopRef and re-persisting
  // the very session Cancel had just cleared.
  const discardRef = useRef(false);

  const [singleFileStatus, setSingleFileStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A previously-stopped scan, persisted in IndexedDB (survives navigating
  // away and back) -- powers the idle screen's "Indexing is already in
  // progress..." banner, matching desktop's ScanOpenBanner.
  const [pendingSession, setPendingSession] = useState<ScanSessionRecord | null>(null);

  // Matches CaseDocumentsPanel's SSR-safe pattern: computed after mount,
  // not inline during render, so server and first-client-render markup
  // agree (avoids a hydration mismatch on the window-only check below).
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setSupported("showDirectoryPicker" in window);
    getScanSession()
      .then((session) => setPendingSession(session ?? null))
      .catch(() => {});
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

  // Shared by a fresh start, Restart, Continue, and a reopened stopped
  // session -- runs the scan over `collected` starting at file index
  // `startFrom`. On a natural stop (user pressed Stop before reaching the
  // end), persists a ScanSessionRecord so the "in progress" banner and
  // Restart/Continue/Cancel controls survive a navigation away; on a full
  // completion, clears any persisted session.
  async function runScan(
    collected: { relativePath: string; fileHandle: FileSystemFileHandle }[],
    startFrom: number,
    force: boolean,
    dirHandle: FileSystemDirectoryHandle
  ) {
    stopRef.current = false;
    discardRef.current = false;
    setRunning(true);

    const existingByPath = new Map<string, string>();
    const res = await fetch("/api/v1/documents");
    if (res.ok) {
      const data = await res.json();
      for (const doc of data.documents as DocumentRow[]) {
        existingByPath.set(doc.relativePath, doc.id);
      }
    }

    let processed = startFrom;
    for await (const event of processGlobalScan(collected.slice(startFrom), existingByPath, force, dirHandle.name)) {
      if (stopRef.current) break;
      setCurrentFileName(displayName(event));
      processed += 1;
      setProcessedCount(processed);
      setLog((prev) => [...prev, describeEvent(event)]);
    }

    setCurrentFileName(null);
    setRunning(false);

    if (discardRef.current) {
      // Cancel already cleared state and the persisted session -- don't
      // let this stale continuation resurrect it.
      return;
    }

    if (stopRef.current && processed < collected.length) {
      const session: ScanSessionRecord = {
        dirHandle,
        dirName: dirHandle.name,
        forceReindex: force,
        totalFiles: collected.length,
        startIndex: processed,
        updatedAt: Date.now(),
      };
      await saveScanSession(session).catch(() => {});
      setPendingSession(session);
    } else {
      await clearScanSession().catch(() => {});
      setPendingSession(null);
    }
  }

  async function handleStartIndexing() {
    if (!pickedHandle) return;
    setError(null);
    setLog([]);
    setProcessedCount(0);
    setCurrentFileName(null);

    const collected = await collectFiles(pickedHandle);
    setFiles(collected);
    setStage("progress");

    await runScan(collected, 0, forceReindex, pickedHandle);
  }

  async function handleRestart() {
    if (!pickedHandle) return;
    setError(null);
    setLog([]);
    setProcessedCount(0);
    setCurrentFileName(null);
    await runScan(files, 0, forceReindex, pickedHandle);
  }

  async function handleContinue() {
    if (!pickedHandle) return;
    setError(null);
    setCurrentFileName(null);
    await runScan(files, processedCount, forceReindex, pickedHandle);
  }

  function handleStop() {
    stopRef.current = true;
  }

  function handleDiscardProgress() {
    stopRef.current = true;
    discardRef.current = true;
    clearScanSession().catch(() => {});
    setPendingSession(null);
    setStage("idle");
    setPickedHandle(null);
    setFiles([]);
    setProcessedCount(0);
    setLog([]);
  }

  // Matches desktop's ScanFooter "Index Another File/Folder": a plain UI
  // reset back to the picker, not a cancellation -- if the just-finished
  // run stopped early, its persisted session (pendingSession) is left
  // alone, so the "in progress" banner still offers to resume it later.
  function handleIndexAnother() {
    setStage("idle");
    setPickedHandle(null);
    setFiles([]);
    setProcessedCount(0);
    setLog([]);
    setCurrentFileName(null);
  }

  async function handleOpenSession() {
    if (!pendingSession) return;
    setError(null);
    const granted = await ensureReadPermission(pendingSession.dirHandle);
    if (!granted) {
      setError(t("documents_connect_error"));
      return;
    }
    const collected = await collectFiles(pendingSession.dirHandle);
    setPickedHandle(pendingSession.dirHandle);
    setForceReindex(pendingSession.forceReindex);
    setFiles(collected);
    setProcessedCount(Math.min(pendingSession.startIndex, collected.length));
    setLog([]);
    setCurrentFileName(null);
    setRunning(false);
    setStage("progress");
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

  const stoppedEarly = !running && files.length > 0 && processedCount < files.length;

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

          {pendingSession && (
            <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-blue-200 bg-blue-50 px-4 py-2.5 dark:border-blue-900 dark:bg-blue-950/40">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
                <Loader2 className="h-3.5 w-3.5 animate-pulse shrink-0" />
                Indexing is already in progress...
              </div>
              <button
                onClick={handleOpenSession}
                className="h-7 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shrink-0"
              >
                Open
              </button>
            </div>
          )}
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
              {running && (
                <>
                  <button onClick={handleStop} className="h-8 px-3 rounded-md border border-destructive/40 text-destructive text-xs font-medium hover:bg-destructive/10">
                    Stop
                  </button>
                  <button onClick={handleDiscardProgress} className="h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-muted">
                    Cancel
                  </button>
                </>
              )}
              {!running && stoppedEarly && (
                <>
                  <button onClick={handleRestart} className="h-8 px-3 rounded-md border border-blue-200 text-blue-700 text-xs font-semibold hover:bg-blue-50/50">
                    Restart
                  </button>
                  <button onClick={handleContinue} className="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">
                    Continue
                  </button>
                  <button onClick={handleDiscardProgress} className="h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-muted">
                    Cancel
                  </button>
                </>
              )}
              {!running && !stoppedEarly && (
                <button onClick={handleDiscardProgress} className="h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-muted">
                  Close
                </button>
              )}
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
                <span className={entry.status === "indexed" ? "text-emerald-600" : entry.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                  {entry.status === "indexed" ? "✓" : entry.status === "failed" ? "✗" : "–"}
                </span>{" "}
                <span className="font-medium text-foreground">{entry.fileName}</span>{" "}
                <span className="text-muted-foreground">{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stage === "progress" && pickedHandle && !running && log.length > 0 && (
        <div className="max-w-2xl mx-auto -mt-px rounded-b-xl border border-t-0 border-border bg-muted/20 px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-5 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="font-semibold text-foreground">{log.filter((e) => e.status === "indexed").length} Indexed</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/50" />
              <span className="font-semibold text-foreground">{log.filter((e) => e.status === "skipped").length} Skipped</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
              <span className="font-semibold text-destructive">{log.filter((e) => e.status === "failed").length} Failed</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/app/documents" className="h-8 px-3 rounded-md border border-border text-xs font-medium hover:bg-muted inline-flex items-center">
              Go to Smart Search
            </Link>
            <button onClick={handleIndexAnother} className="h-8 px-3 rounded-md bg-foreground text-background text-xs font-semibold hover:opacity-90">
              Index Another File/Folder
            </button>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto mt-6 text-center">{error && <p className="text-sm text-destructive">{error}</p>}</div>
    </div>
  );
}

// Shows just the immediate parent directory, not the full relative path
// -- "case-1/file-1.docx", not "clients/2024/case-1/file-1.docx" -- since
// browsers already don't expose the folder's absolute path, and the full
// chain is more noise than context in a scrolling log.
function displayName(event: GlobalScanEvent): string {
  const segments = event.relativePath.split("/");
  return segments.length > 1 ? segments.slice(-2).join("/") : event.fileName;
}

function describeEvent(event: GlobalScanEvent): LogEntry {
  const fileName = displayName(event);
  if (event.type === "skipped") {
    return { fileName, message: "already indexed — skipped", status: "skipped" };
  }
  if (event.type === "failed") {
    return { fileName, message: "failed to register", status: "failed" };
  }
  return {
    fileName,
    message: event.searchable ? "indexed for search" : "registered (not searchable — only .txt/.docx/.pdf are indexed)",
    status: "indexed",
  };
}
