import { CaseTaskDraft } from "@/lib/task/types";

interface CaseManagementCaseCreateTaskReviewProps {
  taskTemplateName?: string;
  taskDrafts: CaseTaskDraft[];
  onUpdateDraft: (index: number, patch: Partial<CaseTaskDraft>) => void;
  loading: boolean;
  isLgScreen: boolean;
  // Whether this is the only right-panel content (no case-template fields
  // shown alongside it) -- if so, it fills the available height like the
  // fields panel does; otherwise it sits below it at a bounded height.
  fillsAvailableSpace: boolean;
}

export default function CaseManagementCaseCreateTaskReview({
  taskTemplateName,
  taskDrafts,
  onUpdateDraft,
  loading,
  isLgScreen,
  fillsAvailableSpace,
}: CaseManagementCaseCreateTaskReviewProps) {
  const selectedCount = taskDrafts.filter((d) => d.selected).length;

  return (
    <div
      className={`rounded-lg border border-border bg-card p-4 flex flex-col gap-3 min-w-0 animate-in fade-in slide-in-from-right-4 duration-300 ${
        fillsAvailableSpace && isLgScreen ? "h-full" : "max-h-[45%] shrink-0"
      }`}
      style={fillsAvailableSpace && isLgScreen ? { flex: "1 1 0%" } : undefined}
    >
      <div className="shrink-0">
        <h3 className="text-sm font-bold text-foreground">Tasks to Create</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          From "{taskTemplateName}" — {selectedCount} of {taskDrafts.length} selected. Uncheck or edit any task before creating the case.
        </p>
      </div>

      {taskDrafts.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">This template has no tasks.</p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
          {taskDrafts.map((draft, index) => (
            <div
              key={draft.templateItemId}
              className={`rounded-md border p-3 transition-colors ${
                draft.selected ? "border-border bg-muted/20" : "border-border/50 bg-muted/5 opacity-60"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={draft.selected}
                  onChange={(e) => onUpdateDraft(index, { selected: e.target.checked })}
                  className="mt-1 rounded border-input text-primary focus:ring-ring h-3.5 w-3.5 cursor-pointer shrink-0"
                  disabled={loading}
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={draft.title}
                      onChange={(e) => onUpdateDraft(index, { title: e.target.value })}
                      disabled={loading || !draft.selected}
                      placeholder="Task title"
                      className="flex-1 rounded-md border border-input bg-background px-2.5 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all disabled:opacity-60"
                    />
                    <input
                      type="text"
                      value={draft.estimateShorthand}
                      onChange={(e) => onUpdateDraft(index, { estimateShorthand: e.target.value })}
                      disabled={loading || !draft.selected}
                      placeholder="3d, 4h"
                      className="w-24 rounded-md border border-input bg-background px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring transition-all disabled:opacity-60"
                    />
                  </div>
                  <textarea
                    value={draft.description}
                    onChange={(e) => onUpdateDraft(index, { description: e.target.value })}
                    disabled={loading || !draft.selected}
                    placeholder="Description (optional)"
                    rows={2}
                    className="w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring transition-all resize-y disabled:opacity-60"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
