import { useRef, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "../ui/button";
import { useNavigate } from "react-router-dom";

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

type Props = {
  show: boolean;
  isFolder: boolean;
  isProcessing: boolean;
  selectedPath: string;
  items: ProgressItem[];
  currentItem: ProgressItem | undefined;
  summary: IndexSummary | null;
  error: string | null;
  startIndexing: (path: string, isFolder: boolean) => void;
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
}: Props) {
  const navigate = useNavigate();
  const outputRef = useRef<HTMLDivElement>(null);
  const progressPercent = currentItem
    ? Math.round((currentItem.current / currentItem.total) * 100)
    : 0;

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
        startIndexing(selected, false);
      }
    } catch (err) {
      console.error("Error choosing file:", err);
    }
  }

  async function handleSelectFolder() {
    try {
      const selected = await open({ directory: true });
      if (selected && typeof selected === "string") {
        startIndexing(selected, true);
      }
    } catch (err) {
      console.error("Error choosing folder:", err);
    }
  }

  // --- IDLE STATE VIEW ---
  if (!isProcessing && !show && !summary) {
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: Index Directory */}
          <div
            onClick={handleSelectFolder}
            className="group relative rounded-xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer flex flex-col justify-between items-start hover:-translate-y-0.5"
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

          {/* Card 2: Index File */}
          <div
            onClick={handleSelectFile}
            className="group relative rounded-xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer flex flex-col justify-between items-start hover:-translate-y-0.5"
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
        </div>
      </div>
    );
  }

  // --- PROCESSING / STATUS STATE VIEW ---
  return (
    <div className="max-w-4xl mx-auto space-y-6 py-4 animate-fade-in">
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {/* Header bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-6 py-4 border-b border-border/60 bg-muted/30 gap-3">
          <div className="space-y-1 min-w-0">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
              {isFolder ? "Directory Sync" : "Single File Scan"}
            </span>
            <h3 className="text-sm font-bold truncate text-foreground font-mono">
              {selectedPath}
            </h3>
          </div>
          {isProcessing && currentItem && (
            <span className="shrink-0 text-xs font-mono font-semibold bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20">
              Files: {currentItem.current} / {currentItem.total}
            </span>
          )}
        </div>

        {/* Progress bar container */}
        {isProcessing && currentItem && (
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
            className="h-64 overflow-y-auto px-4 py-3 rounded-lg border bg-muted/80 font-mono text-xs leading-relaxed space-y-2 text-foreground/90 scrollbar-thin"
          >
            {items.length === 0 && isProcessing && (
              <p className="text-muted-foreground italic">Connecting to Tauri background pipeline...</p>
            )}
            {items
              .filter((i) => i.status !== "processing")
              .map((item) => (
                <div key={item.file_name} className="flex items-start gap-3 border-b border-border/10 pb-1 last:border-0 last:pb-0">
                  <span className="mt-0.5 w-4 shrink-0 text-center">
                    <StatusIcon status={item.status} />
                  </span>
                  <span className="w-48 shrink-0 truncate text-foreground font-semibold">
                    {item.file_name}
                  </span>
                  <span className="text-muted-foreground truncate">{item.message}</span>
                </div>
              ))}
            {error && (
              <div className="text-red-500 font-bold border-t border-red-200/20 pt-2 mt-2">
                CRITICAL ERROR: {error}
              </div>
            )}
          </div>
        </div>

        {/* Summary Footer */}
        {summary && (
          <div className="border-t border-border/80 bg-muted/20 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-6 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="font-semibold">{summary.indexed} Indexed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/60" />
                <span className="font-semibold">{summary.skipped} Skipped</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="font-semibold text-red-600">{summary.failed} Failed</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate("/docs-management/search")}>
                Go to Smart Search
              </Button>
              <Button size="sm" onClick={() => navigate("/docs-management/scan")}>
                Index Another File/Folder
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
