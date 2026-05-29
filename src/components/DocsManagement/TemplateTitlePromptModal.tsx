import { useState } from "react";
import { Button } from "../ui/button";

interface TemplateTitlePromptModalProps {
  fileName: string;
  onConfirm: (title: string) => void;
  onCancel: () => void;
}

export default function TemplateTitlePromptModal({
  fileName,
  onConfirm,
  onCancel,
}: TemplateTitlePromptModalProps) {
  const [title, setTitle] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(title.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-card border border-border rounded-lg shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200"
      >
        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-foreground">Add Document Template</h3>
          <p className="text-xs text-muted-foreground leading-normal">
            You are importing <strong className="text-foreground font-mono">{fileName}</strong>. Please enter a title or a one-line description for this document template:
          </p>
        </div>

        <div className="space-y-2">
          <input
            type="text"
            placeholder="e.g. Torts claim for medical negligence"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
            autoFocus
            required
          />
        </div>

        <div className="flex justify-end gap-2.5 border-t border-border pt-4">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            Import Template
          </Button>
        </div>
      </form>
    </div>
  );
}
