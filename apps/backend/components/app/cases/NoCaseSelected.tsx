import { Folder } from "lucide-react";

// Matches desktop's OpenCasesDocumentsPanel.tsx empty-selection state.
export default function NoCaseSelected() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card text-center p-10">
      <Folder className="size-10 text-muted-foreground/50" />
      <p className="text-sm font-medium text-foreground">No case selected</p>
      <p className="text-xs text-muted-foreground">Select a case from the list to see its details.</p>
    </div>
  );
}
