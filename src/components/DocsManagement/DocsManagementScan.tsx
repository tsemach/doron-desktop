import { useRef, useEffect } from "react";

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
    return <span className="inline-block animate-spin text-muted-foreground">⟳</span>;
  }
  if (status === "ok") return <span className="text-green-500">✓</span>;
  if (status === "failed") return <span className="text-red-500">✗</span>;
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
}: Props) {
  const outputRef = useRef<HTMLDivElement>(null);
  const progress = currentItem ? `[${currentItem.current} / ${currentItem.total}]` : "";

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [items]);

  if (!show) return null;

  return (
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
  );
}
