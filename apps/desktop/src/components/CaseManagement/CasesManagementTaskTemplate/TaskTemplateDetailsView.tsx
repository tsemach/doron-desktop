import { useState, useEffect } from "react";
import { TaskTemplate, TaskTemplateItemDraft } from "@/lib/task/types";
import { parseEstimateShorthand, formatEstimateShorthand } from "@/lib/task/estimate";
import TaskTemplateDeleteWarningModal from "./TaskTemplateDeleteWarningModal";
import { Button } from "../../ui/button";

interface TaskTemplateDetailsViewProps {
  activeTemplate: TaskTemplate;
  onDelete: () => Promise<void>;
  onRename: (newName: string) => Promise<void>;
  onAddItem: (item: TaskTemplateItemDraft) => Promise<void>;
  onRemoveItem: (itemId: number) => Promise<void>;
}

export default function TaskTemplateDetailsView({
  activeTemplate,
  onDelete,
  onRename,
  onAddItem,
  onRemoveItem,
}: TaskTemplateDetailsViewProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newEstimate, setNewEstimate] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setIsEditingName(false);
    setIsAddingItem(false);
    setShowDeleteConfirm(false);
    setEditingNameValue(activeTemplate.name);
  }, [activeTemplate]);

  async function handleSaveNameInline(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!editingNameValue.trim()) return;
    await onRename(editingNameValue.trim());
    setIsEditingName(false);
  }

  async function handleAddItemInline(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) {
      setTitleError("Please enter a task title.");
      return;
    }
    const parsed = parseEstimateShorthand(newEstimate);
    if (!parsed) {
      setEstimateError('Enter an estimate like "3d", "0.5d" or "4h".');
      return;
    }
    await onAddItem({ title: newTitle.trim(), estimateValue: parsed.value, estimateUnit: parsed.unit, description: newDescription.trim() });
    setNewTitle("");
    setNewEstimate("");
    setNewDescription("");
    setTitleError(null);
    setEstimateError(null);
    setIsAddingItem(false);
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso.slice(0, 10);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex items-start justify-between border-b border-border pb-4">
        <div>
          {isEditingName ? (
            <form onSubmit={handleSaveNameInline} className="flex items-center gap-2">
              <input
                type="text"
                value={editingNameValue}
                onChange={(e) => setEditingNameValue(e.target.value)}
                className="text-xl font-bold border-b border-primary bg-transparent focus:outline-none py-0.5 text-foreground"
                autoFocus
              />
              <button type="submit" className="text-green-600 hover:text-green-800 text-sm font-semibold p-1" title="Save name">
                ✓
              </button>
              <button type="button" onClick={() => setIsEditingName(false)} className="text-red-500 hover:text-red-700 text-sm font-semibold p-1" title="Cancel">
                ✕
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-foreground tracking-tight">{activeTemplate.name}</h3>
              <button
                onClick={() => {
                  setIsEditingName(true);
                  setEditingNameValue(activeTemplate.name);
                }}
                className="p-1 text-muted-foreground hover:text-foreground hover:scale-110 transition-transform"
                title="Rename task template"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Created on {formatDate(activeTemplate.created_at)}
          </p>
        </div>
        <div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-xs font-semibold text-muted-foreground hover:text-destructive hover:underline px-3 py-1.5 transition-colors"
          >
            Delete Template
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between border-b pb-1">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Tasks ({activeTemplate.items.length})
          </h4>
          {!isAddingItem && (
            <Button size="sm" onClick={() => setIsAddingItem(true)} className="h-7 px-2.5 text-xs">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline">
                <path d="M5 12h14" />
                <path d="M12 5v14" />
              </svg>
              Add Task
            </Button>
          )}
        </div>

        {activeTemplate.items.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No tasks in this template yet.</p>
        ) : (
          <div className="space-y-2">
            {activeTemplate.items.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between p-3 rounded-md border border-border bg-muted/20"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate" title={item.title}>
                      {item.title}
                    </span>
                    <span className="text-xs font-mono bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 border border-border shrink-0">
                      {formatEstimateShorthand(item.estimate_value, item.estimate_unit)}
                    </span>
                  </div>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">{item.description}</p>
                  )}
                </div>
                <button
                  onClick={() => onRemoveItem(item.id)}
                  className="p-1 text-muted-foreground hover:text-destructive hover:bg-accent rounded transition-all cursor-pointer ml-2 shrink-0"
                  title="Remove task from template"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {isAddingItem && (
          <form onSubmit={handleAddItemInline} className="space-y-2 p-3 rounded-md border border-dashed border-input bg-muted/10">
            <div className="flex gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => {
                  setNewTitle(e.target.value);
                  setTitleError(null);
                }}
                placeholder="Task title"
                className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                autoFocus
              />
              <input
                type="text"
                value={newEstimate}
                onChange={(e) => {
                  setNewEstimate(e.target.value);
                  setEstimateError(null);
                }}
                placeholder="3d, 0.5d, 4h"
                className="w-32 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              />
            </div>
            {titleError && <p className="text-xs text-destructive">{titleError}</p>}
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all resize-y"
            />
            {estimateError && <p className="text-xs text-destructive">{estimateError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddingItem(false)}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
              >
                Cancel
              </button>
              <button type="submit" className="text-xs font-semibold text-primary hover:underline px-2 py-1">
                Save Task
              </button>
            </div>
          </form>
        )}
      </div>

      {showDeleteConfirm && (
        <TaskTemplateDeleteWarningModal
          templateName={activeTemplate.name}
          onConfirm={onDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
