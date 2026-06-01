import { Button } from "@/components/ui/button";

interface DocumentDeleteModalProps {
  docName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function OpenCasesDocumentDeleteModal({
  docName,
  onConfirm,
  onCancel,
}: DocumentDeleteModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden relative w-[460px] p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center shrink-0 text-red-600 dark:text-red-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" x2="12" y1="9" y2="13" />
              <line x1="12" x2="12.01" y1="17" y2="17" />
            </svg>
          </div>
          <div className="space-y-1.5 flex-1 min-w-0">
            <h3 className="text-base font-bold text-foreground leading-tight">Remove Document</h3>
            <p className="text-xs text-muted-foreground">
              This will permanently delete the file <span className="font-semibold text-foreground/90 font-mono break-all">"{docName}"</span> from the case folder on disk.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Any fields associated with this template that are not used by other documents will also be cleaned up.
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="text-xs px-4 border-border hover:bg-muted"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            className="text-xs px-4 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            Remove Document
          </Button>
        </div>
      </div>
    </div>
  );
}
