import { useRef, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/button";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../../context/LanguageContext";

export type ProgressStatus = "processing" | "ok" | "skipped" | "failed";

export type ProgressItem = {
  file_name: string;
  status: ProgressStatus;
  message: string;
  current: number;
  total: number;
};

export type IndexSummary = {
  indexed: number;
  skipped: number;
  failed: number;
};

function StatusIcon({ status }: { status: ProgressStatus }) {
  if (status === "processing") {
    return <span className="inline-block animate-spin text-blue-500 font-bold">⟳</span>;
  }
  if (status === "ok") return <span className="text-green-500 font-bold">✓</span>;
  if (status === "failed") return <span className="text-red-500 font-bold">✗</span>;
  return <span className="text-muted-foreground">─</span>;
}

export interface IndexingSession {
  path: string;
  is_folder: boolean;
  reindex: boolean;
  start_index: number;
  total_files: number;
  status: string;
  updated_at: string;
}

type Props = {
  show: boolean;
  isFolder: boolean;
  isProcessing: boolean;
  selectedPath: string;
  items: ProgressItem[];
  currentItem: ProgressItem | undefined;
  summary: IndexSummary | null;
  error: string | null;
  startIndexing: (path: string, isFolder: boolean, isContinue?: boolean, startIndex?: number, reindex?: boolean) => void;
  resetState?: () => void;
  setSelectedPath: (path: string) => void;
  setIsFolder: (isFolder: boolean) => void;
  setShowOutput: (show: boolean) => void;
};

export default function DocsManagementScan({
  show,
  isFolder,
  isProcessing,
  selectedPath,
  items,
  currentItem,
  summary,
  error,
  startIndexing,
  resetState,
  setSelectedPath,
  setIsFolder,
  setShowOutput,
}: Props) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const outputRef = useRef<HTMLDivElement>(null);
  const [reindex, setReindex] = useState(false);
  const [activeSession, setActiveSession] = useState<IndexingSession | null>(null);

  useEffect(() => {
    // When entering the Scan & Index page, default to showing the cards/main selection view
    setShowOutput(false);
  }, [setShowOutput]);

  useEffect(() => {
    async function checkActiveSession() {
      try {
        const sessions = await invoke<IndexingSession[]>("get_active_indexing_sessions");
        const active = sessions.filter((s) => s.total_files === 0 || s.start_index < s.total_files);
        if (active.length > 0) {
          active.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          setActiveSession(active[0]);
        } else {
          setActiveSession(null);
        }
      } catch (err) {
        console.error("Failed to check active indexing sessions in scan view:", err);
      }
    }
    checkActiveSession();
  }, [isProcessing]);

  function handleOpenActiveSession() {
    if (!activeSession) return;
    setSelectedPath(activeSession.path);
    setIsFolder(activeSession.is_folder);
    setShowOutput(true);
  }



  const actualItemsCount = items.filter((i) => i.file_name !== "").length;

  const currentCount = actualItemsCount;

  const totalCount = isProcessing && currentItem
    ? currentItem.total
    : (items[0]?.total || actualItemsCount);

  const progressPercent = totalCount > 0
    ? Math.round((currentCount / totalCount) * 100)
    : 0;

  async function handleStopIndexing() {
    try {
      await invoke("stop_indexing");
    } catch (err) {
      console.error("Error stopping indexing:", err);
    }
  }

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  async function executeCancelIndexing() {
    try {
      if (isProcessing) {
        await invoke("stop_indexing");
      }
      if (selectedPath) {
        await invoke("delete_indexing_session", { path: selectedPath });
      }
      if (resetState) {
        resetState();
      }
    } catch (err) {
      console.error("Error cancelling indexing:", err);
    }
  }

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [items, currentItem]);

  async function handleSelectFile() {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Documents", extensions: ["docx", "pdf", "xlsx", "xls", "txt"] }],
      });
      if (selected && typeof selected === "string") {
        startIndexing(selected, false, false, 0, reindex);
      }
    } catch (err) {
      console.error("Error choosing file:", err);
    }
  }

  async function handleSelectFolder() {
    try {
      const selected = await open({ directory: true });
      if (selected && typeof selected === "string") {
        setSelectedPath(selected);
        setIsFolder(true);
      }
    } catch (err) {
      console.error("Error choosing folder:", err);
    }
  }

  // --- FOLDER SELECTED STATE VIEW (Before starting scan) ---
  if (!isProcessing && !show && !summary && selectedPath && isFolder) {
    return (
      <div className="max-w-xl mx-auto py-8 animate-fade-in-down space-y-6">
        <div className="rounded-xl border border-border bg-card shadow-md overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-border/60 bg-muted/30">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
              Folder Selected
            </span>
            <h3 className="text-sm font-bold truncate text-foreground font-mono mt-1">
              {selectedPath}
            </h3>
          </div>

          <div className="p-6 space-y-6">
            {/* Reindex Option checkbox */}
            <div className="flex items-center">
              <label className="inline-flex items-center gap-2.5 px-4 py-3 rounded-lg border border-border bg-card shadow-xs cursor-pointer select-none hover:bg-muted/30 transition-colors w-full">
                <input
                  type="checkbox"
                  checked={reindex}
                  onChange={(e) => setReindex(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20 accent-primary cursor-pointer"
                />
                <span className="text-xs font-semibold text-foreground/95">
                  Force re-index / override already processed documents
                </span>
              </label>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={resetState}
                className="h-9 px-4 text-xs font-semibold"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-9 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-750 text-white"
                onClick={() => startIndexing(selectedPath, true, false, 0, reindex)}
              >
                Start Indexing
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- IDLE STATE VIEW ---
  if (!show && !summary) {
    const isDisabled = !!activeSession || isProcessing;
    const isFolderActive = activeSession ? activeSession.is_folder : false;

    return (
      <div className="max-w-4xl mx-auto space-y-8 py-4 animate-fade-in-down">
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Index Documents for AI Search
          </h2>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">
            Upload files or link local directories. Claude will parse text, extract metadata keywords,
            and generate vector embeddings for intelligent semantic search.
          </p>
        </div>

        {/* Dual Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
          {/* Card 1: Index Entire Folder */}
          <div
            onClick={(isDisabled && isFolderActive) ? undefined : handleSelectFolder}
            className={`group relative rounded-xl border border-border bg-card p-6 shadow-sm transition-all duration-300 flex flex-col justify-between items-start ${
              (isDisabled && isFolderActive)
                ? "opacity-60 cursor-not-allowed pointer-events-none bg-muted/20"
                : "hover:shadow-md cursor-pointer hover:-translate-y-0.5"
            }`}
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold group-hover:text-primary transition-colors">
                  Index Entire Folder
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Recursively scans a directory for PDF, DOCX, TXT, and Excel sheets. Perfect for importing legal archives.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center text-xs font-semibold text-primary gap-1 group-hover:underline">
              Choose Directory
              <span>→</span>
            </div>
          </div>

          {/* Card 2: Index Single Document */}
          <div
            onClick={(isDisabled && !isFolderActive) ? undefined : handleSelectFile}
            className={`group relative rounded-xl border border-border bg-card p-6 shadow-sm transition-all duration-300 flex flex-col justify-between items-start ${
              (isDisabled && !isFolderActive)
                ? "opacity-60 cursor-not-allowed pointer-events-none bg-muted/20"
                : "hover:shadow-md cursor-pointer hover:-translate-y-0.5"
            }`}
          >
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold group-hover:text-primary transition-colors">
                  Index Single Document
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Select a single document to index. Ideal for quick updates or testing formatting.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center text-xs font-semibold text-primary gap-1 group-hover:underline">
              Choose File
              <span>→</span>
            </div>
          </div>

          {/* Row 2: Status Banners */}
          {activeSession && isFolderActive && (
            <div className="flex items-center justify-between text-xs animate-fade-in col-start-1 px-1">
              <div className="flex items-center gap-2 text-blue-600 font-medium">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 animate-pulse"
                >
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                  <path d="M12 17v-4" />
                  <path d="M12 9h.01" />
                </svg>
                <span className="font-semibold">
                  Indexing is already in progress...
                </span>
              </div>
              <Button
                size="sm"
                onClick={handleOpenActiveSession}
                className="h-7 bg-blue-600 hover:bg-blue-750 text-white font-semibold text-[10px] px-3 shrink-0"
              >
                Open
              </Button>
            </div>
          )}

          {activeSession && !isFolderActive && (
            <>
              {/* Push the message to Column 2 on desktop */}
              <div className="hidden md:block" />
              <div className="flex items-center justify-between text-xs animate-fade-in px-1">
                <div className="flex items-center gap-2 text-blue-600 font-medium">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 animate-pulse"
                  >
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                    <path d="M12 17v-4" />
                    <path d="M12 9h.01" />
                  </svg>
                  <span className="font-semibold">
                    Indexing is already in progress...
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={handleOpenActiveSession}
                  className="h-7 bg-blue-600 hover:bg-blue-750 text-white font-semibold text-[10px] px-3 shrink-0"
                >
                  Open
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // --- PROCESSING / STATUS STATE VIEW ---
  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4 animate-fade-in">
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Header bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 items-center px-6 py-4 border-b border-border/60 bg-muted/30 gap-3">
          {/* Column 1: Path */}
          <div className="space-y-1 min-w-0 justify-self-start">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
              {isFolder ? "Directory Sync" : "Single File Scan"}
            </span>
            <h3 className="text-sm font-bold truncate text-foreground font-mono">
              {selectedPath}
            </h3>
          </div>

          {/* Column 2: Files Count (Centered) */}
          <div className="flex justify-center justify-self-center">
            {(isProcessing || items.length > 0) && (
              <span className="shrink-0 text-xs font-mono font-semibold bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20">
                Files: {currentCount} / {totalCount}
              </span>
            )}
          </div>

          {/* Column 3: Actions (Right-aligned) */}
          <div className="flex items-center gap-2 justify-self-end">
            {isProcessing ? (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8 text-xs font-semibold"
                  onClick={handleStopIndexing}
                >
                  Stop
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-semibold border-muted-foreground/30 text-muted-foreground hover:bg-muted"
                  onClick={() => setShowCancelConfirm(true)}
                >
                  Cancel
                </Button>
              </>
            ) : !summary ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-semibold border-blue-200 text-blue-700 hover:bg-blue-50/50"
                  onClick={() => startIndexing(selectedPath, isFolder, false, 0)}
                >
                  Restart
                </Button>
                <Button
                  size="sm"
                  className="h-8 text-xs font-semibold bg-blue-600 hover:bg-blue-750 text-white"
                  onClick={() => startIndexing(selectedPath, isFolder, true, items.filter((i) => i.file_name !== "").length)}
                >
                  Continue
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs font-semibold border-muted-foreground/30 text-muted-foreground hover:bg-muted"
                  onClick={() => setShowCancelConfirm(true)}
                >
                  Cancel
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {/* Progress bar container */}
        {(isProcessing || items.some((i) => i.message === "Indexing stopped by user")) && (
          <div className="px-6 pt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-mono text-primary">{progressPercent}%</span>
            </div>
            <div className="w-full bg-muted h-2.5 rounded-full overflow-hidden border border-border/40">
              <div
                className="bg-primary h-full transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Active item status detail */}
        {isProcessing && currentItem && (
          <div className="flex items-center gap-3 mx-6 mt-4 p-3 rounded-lg border border-blue-100 bg-blue-50/40 font-mono text-xs text-blue-900">
            <span className="inline-block animate-spin text-blue-500 w-4 shrink-0 text-center text-sm font-bold">
              ⟳
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate">{currentItem.file_name}</p>
              <p className="text-blue-700 text-[10px] mt-0.5">{currentItem.message}</p>
            </div>
          </div>
        )}

        {/* Log list / Console */}
        <div className="px-6 py-4">
          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">
            Indexing Log Output
          </label>
          <div
            ref={outputRef}
            className="h-64 overflow-y-auto overflow-x-auto px-4 py-3 rounded-lg border bg-muted/80 font-mono text-xs leading-relaxed space-y-2 text-foreground/90 scrollbar-thin"
          >
            {items.length === 0 && isProcessing && (
              <p className="text-muted-foreground italic">Connecting to Tauri background pipeline...</p>
            )}
            {items
              .filter((i) => i.status !== "processing" && i.file_name && i.file_name.trim() !== "" && i.message !== "Indexing stopped by user")
              .map((item) => (
                <div key={item.file_name} className="flex items-start gap-3 border-b border-border/10 pb-1 last:border-0 last:pb-0 whitespace-nowrap min-w-max">
                  <span className="mt-0.5 w-4 shrink-0 text-center">
                    <StatusIcon status={item.status} />
                  </span>
                  <span className="shrink-0 text-foreground font-semibold">
                    {item.file_name}
                  </span>
                  <span className="text-muted-foreground">{item.message}</span>
                </div>
              ))}
            {error && (
              <div className="text-red-500 font-bold border-t border-red-200/20 pt-2 mt-2">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Summary Footer */}
        {(summary || (!isProcessing && items.length > 0)) && (
          <div className="border-t border-border/80 bg-muted/20 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-6 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="font-semibold">{items.filter((i) => i.status === "ok").length} Indexed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/60" />
                <span className="font-semibold">{items.filter((i) => i.status === "skipped").length} Skipped</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="font-semibold text-red-600">{items.filter((i) => i.status === "failed").length} Failed</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {items.some((i) => i.message === "Indexing stopped by user") && (
                <div className="flex items-center gap-1.5 bg-red-50/50 border border-red-200 px-2.5 py-1 rounded-full text-[10px] uppercase font-bold text-red-600 mr-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  Stopped
                </div>
              )}
              <Button size="sm" variant="outline" onClick={() => navigate("/docs-management/search")}>
                {t("go_to_smart_search")}
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  if (resetState) {
                    resetState();
                  } else {
                    navigate("/docs-management/scan");
                  }
                }}
              >
                Index Another File/Folder
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Custom Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-[2px] flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-card border border-border rounded-xl shadow-lg max-w-sm w-full mx-4 overflow-hidden animate-scale-in">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-border/60 bg-muted/30 flex items-center gap-3">
              <span className="w-7 h-7 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 text-sm">
                ⚠️
              </span>
              <div>
                <h3 className="text-xs font-bold text-foreground">
                  Cancel Indexing
                </h3>
              </div>
            </div>

            {/* Body */}
            <div className="p-5">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Are you sure you want to cancel the indexing process? This will clear all progress for this folder.
              </p>
            </div>

            {/* Actions */}
            <div className="px-5 py-3.5 bg-muted/20 border-t border-border/60 flex items-center justify-end gap-2.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs font-semibold"
                onClick={() => setShowCancelConfirm(false)}
              >
                No
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-8 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white"
                onClick={async () => {
                  setShowCancelConfirm(false);
                  await executeCancelIndexing();
                }}
              >
                Yes, Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
