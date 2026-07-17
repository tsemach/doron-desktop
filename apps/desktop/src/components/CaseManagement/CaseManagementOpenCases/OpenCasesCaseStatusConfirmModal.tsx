import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { getFollowupStatus } from "@/lib/followupStatus";
import type { Tag } from "../CaseManagementTypes";

interface OpenCasesCaseStatusConfirmModalProps {
  /** Only the case's current tags are needed, to optionally surface the follow-up warning. */
  tags: Tag[];
  title: string;
  message: ReactNode;
  confirmLabel: string;
  icon: ReactNode;
  iconClassName?: string;
  notePlaceholder?: string;
  initialNotes?: string;
  showFollowupWarning?: boolean;
  onConfirm: (notes: string) => void;
  onCancel: () => void;
}

export default function OpenCasesCaseStatusConfirmModal({
  tags,
  title,
  message,
  confirmLabel,
  icon,
  iconClassName = "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400",
  notePlaceholder = "Add any relevant details...",
  initialNotes = "",
  showFollowupWarning = false,
  onConfirm,
  onCancel,
}: OpenCasesCaseStatusConfirmModalProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [isSaving, setIsSaving] = useState(false);

  const followupTag = tags.find((tg) => tg.name === "followup");
  const followupStatus = showFollowupWarning ? getFollowupStatus(followupTag?.value) : null;

  const handleConfirm = async () => {
    setIsSaving(true);
    try {
      await onConfirm(notes.trim());
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 overflow-hidden relative w-[480px] p-6">
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconClassName}`}>
            {icon}
          </div>
          <div className="space-y-1.5 flex-1 min-w-0">
            <h3 className="text-base font-bold text-foreground leading-tight">{title}</h3>
            <p className="text-xs text-muted-foreground">{message}</p>
          </div>
        </div>

        {followupStatus && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 p-3">
            <span className="shrink-0">⚠️</span>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              This case has a follow-up —{" "}
              <span className="font-semibold">{followupStatus.label}</span>. Confirming will remove the follow-up.
            </p>
          </div>
        )}

        <div className="mt-4 space-y-1.5">
          <label className="text-xs font-semibold text-foreground">Add a note (optional)</label>
          <textarea
            placeholder={notePlaceholder}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground placeholder:text-muted-foreground/80 leading-relaxed resize-none min-h-[70px]"
          />
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSaving}
            className="text-xs px-4 border-border hover:bg-muted"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={isSaving}
            className="text-xs px-4"
          >
            {isSaving ? "Saving..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
