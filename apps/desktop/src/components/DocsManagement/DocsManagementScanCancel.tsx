import { Button } from "../ui/button";

interface DocsManagementScanCancelProps {
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export default function DocsManagementScanCancel({
  onClose,
  onConfirm,
}: DocsManagementScanCancelProps) {
  return (
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
            onClick={onClose}
          >
            No
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-8 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white"
            onClick={async () => {
              onClose();
              await onConfirm();
            }}
          >
            Yes, Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
