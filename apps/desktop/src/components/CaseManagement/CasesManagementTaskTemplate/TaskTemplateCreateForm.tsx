import { useState } from "react";
import { Button } from "../../ui/button";
import { parseEstimateShorthand, formatEstimateShorthand } from "@/lib/task/estimate";
import { TaskTemplateItemDraft } from "@/lib/task/types";

interface TaskTemplateCreateFormProps {
  onSave: (name: string, items: TaskTemplateItemDraft[]) => Promise<void>;
  onCancel: () => void;
}

export default function TaskTemplateCreateForm({ onSave, onCancel }: TaskTemplateCreateFormProps) {
  const [templateName, setTemplateName] = useState("");
  const [items, setItems] = useState<TaskTemplateItemDraft[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newEstimate, setNewEstimate] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleAddItem(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!newTitle.trim()) return;
    const parsed = parseEstimateShorthand(newEstimate);
    if (!parsed) {
      setEstimateError('Enter an estimate like "3d", "0.5d" or "4h".');
      return;
    }
    setItems([...items, { title: newTitle.trim(), estimateValue: parsed.value, estimateUnit: parsed.unit, description: newDescription.trim() }]);
    setNewTitle("");
    setNewEstimate("");
    setNewDescription("");
    setEstimateError(null);
  }

  function handleRemoveItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  async function handleFormSubmit() {
    if (!templateName.trim()) {
      alert("Please enter a template name.");
      return;
    }
    setSubmitting(true);
    try {
      await onSave(templateName.trim(), items);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl animate-in slide-in-from-bottom duration-300">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h3 className="text-lg font-bold text-foreground">Create New Task Template</h3>
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-7 text-xs">
          ✕ Cancel
        </Button>
      </div>

      <div className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor="taskTemplateName" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Task Template Name
          </label>
          <input
            id="taskTemplateName"
            type="text"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g. Litigation Basics, Tenant Eviction"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
            disabled={submitting}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
            Tasks
          </label>
          <p className="text-xs text-muted-foreground">
            Tasks auto-created for every case using this template. Due dates are calculated from the estimate at case creation.
          </p>

          <div className="space-y-2 p-3 rounded-md border border-input bg-muted/20 min-h-[50px]">
            {items.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">No tasks added yet.</span>
            ) : (
              items.map((item, idx) => (
                <div key={idx} className="flex items-start gap-2.5 p-2 rounded-md border border-border bg-card">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{item.title}</span>
                      <span className="text-xs font-mono bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 border border-border shrink-0">
                        {formatEstimateShorthand(item.estimateValue, item.estimateUnit)}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(idx)}
                    className="text-muted-foreground hover:text-destructive focus:outline-none shrink-0"
                    disabled={submitting}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleAddItem} className="space-y-2 pt-1">
            <div className="flex gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Task title (e.g. File response)"
                className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                disabled={submitting}
              />
              <input
                type="text"
                value={newEstimate}
                onChange={(e) => {
                  setNewEstimate(e.target.value);
                  setEstimateError(null);
                }}
                placeholder="Estimate (3d, 0.5d, 4h)"
                className="w-40 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                disabled={submitting}
              />
            </div>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              disabled={submitting}
            />
            {estimateError && <p className="text-xs text-destructive">{estimateError}</p>}
            <Button type="submit" variant="secondary" size="sm" className="h-8" disabled={submitting}>
              Add Task
            </Button>
          </form>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleFormSubmit} disabled={submitting}>
          {submitting ? "Creating..." : "Create Template"}
        </Button>
      </div>
    </div>
  );
}
