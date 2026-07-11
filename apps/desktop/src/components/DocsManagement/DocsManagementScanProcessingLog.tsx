import { useRef, useEffect } from "react";
import { ProgressItem, ProgressStatus } from "./DocsManagementScan";

function StatusIcon({ status }: { status: ProgressStatus }) {
  if (status === "processing") {
    return <span className="inline-block animate-spin text-blue-500 font-bold">⟳</span>;
  }
  if (status === "ok") return <span className="text-green-500 font-bold">✓</span>;
  if (status === "failed") return <span className="text-red-500 font-bold">✗</span>;
  return <span className="text-muted-foreground">─</span>;
}

interface DocsManagementScanProcessingLogProps {
  items: ProgressItem[];
  isProcessing: boolean;
  error: string | null;
  currentItem: ProgressItem | undefined;
}

export default function DocsManagementScanProcessingLog({
  items,
  isProcessing,
  error,
  currentItem,
}: DocsManagementScanProcessingLogProps) {
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [items, currentItem]);

  return (
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
  );
}
