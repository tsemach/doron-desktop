import { useState } from "react";
import { Button } from "../../ui/button";

interface DeleteWarningModalProps {
  templateName: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export default function DeleteWarningModal({
  templateName,
  onConfirm,
  onCancel,
}: DeleteWarningModalProps) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-2xl p-6 space-y-6 animate-in zoom-in-95 duration-200">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" x2="12" y1="9" y2="13" />
              <line x1="12" x2="12.01" y1="17" y2="17" />
            </svg>
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold text-foreground">Delete Case Template?</h3>
            <p className="text-sm text-muted-foreground leading-normal">
              Are you sure you want to delete the case template <strong className="text-foreground">"{templateName}"</strong>? 
              This will permanently delete this template configuration and cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-border pt-4">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <button
            onClick={handleConfirm}
            className="rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 px-4 py-2 text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
            disabled={submitting}
          >
            {submitting ? "Deleting..." : "Delete Template"}
          </button>
        </div>
      </div>
    </div>
  );
}
