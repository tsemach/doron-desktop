import { Button } from "../ui/button";

interface DocsManagementScanConfirmProps {
  selectedPath: string;
  reindex: boolean;
  setReindex: (val: boolean) => void;
  onCancel?: () => void;
  onStart: () => void;
}

export default function DocsManagementScanConfirm({
  selectedPath,
  reindex,
  setReindex,
  onCancel,
  onStart,
}: DocsManagementScanConfirmProps) {
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
              onClick={onCancel}
              className="h-9 px-4 text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-9 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-750 text-white"
              onClick={onStart}
            >
              Start Indexing
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
