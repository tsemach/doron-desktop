import { useState } from "react";
import { Button } from "./button";
import { Task, TaskStatus, EstimateUnit } from "@/lib/task/types";
import { parseEstimateShorthand, formatEstimateShorthand } from "@/lib/task/estimate";
import { STATUS_OPTION_COLORS } from "@/lib/task/statusColors";

const STATUS_OPTIONS: TaskStatus[] = ["Waiting", "In progress", "Cancel", "Done"];

export interface TaskFormValues {
  title: string;
  description: string;
  status: TaskStatus;
  estimateValue: number | null;
  estimateUnit: EstimateUnit | null;
  dueDate: string | null;
}

interface TaskFormProps {
  mode: "create" | "edit";
  initialTask?: Task | null;
  onSave: (values: TaskFormValues) => Promise<void>;
  onCancel: () => void;
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

export default function TaskForm({ mode, initialTask, onSave, onCancel }: TaskFormProps) {
  const [title, setTitle] = useState(initialTask?.title ?? "");
  const [description, setDescription] = useState(initialTask?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(initialTask?.status ?? "Waiting");
  const [estimate, setEstimate] = useState(
    initialTask?.estimate_value != null && initialTask?.estimate_unit != null
      ? formatEstimateShorthand(initialTask.estimate_value, initialTask.estimate_unit)
      : ""
  );
  const [dueDate, setDueDate] = useState(toDateInputValue(initialTask?.due_date ?? null));
  const [titleError, setTitleError] = useState<string | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError("Please enter a task title.");
      return;
    }

    let estimateValue: number | null = null;
    let estimateUnit: EstimateUnit | null = null;
    if (estimate.trim()) {
      const parsed = parseEstimateShorthand(estimate);
      if (!parsed) {
        setEstimateError('Enter an estimate like "3d", "0.5d" or "4h", or leave it blank.');
        return;
      }
      estimateValue = parsed.value;
      estimateUnit = parsed.unit;
    }

    setSubmitting(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        status,
        estimateValue,
        estimateUnit,
        dueDate: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : null,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-card border border-border rounded-lg shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200"
      >
        <h3 className="text-lg font-bold text-foreground">{mode === "create" ? "Add Task" : "Edit Task"}</h3>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleError(null);
            }}
            placeholder="Task title"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
            disabled={submitting}
            autoFocus
          />
          {titleError && <p className="text-xs text-destructive">{titleError}</p>}
        </div>

        {mode === "edit" && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</label>
            <div className="relative">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full rounded-md border-0 shadow-[0_0_0_1px_var(--border)] bg-background pl-3 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all appearance-none cursor-pointer"
                disabled={submitting}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s} style={STATUS_OPTION_COLORS[s]}>{s}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted-foreground">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-4">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estimate</label>
            <input
              type="text"
              value={estimate}
              onChange={(e) => {
                setEstimate(e.target.value);
                setEstimateError(null);
              }}
              placeholder="3d, 0.5d, 4h (optional)"
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              disabled={submitting}
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              disabled={submitting}
            />
          </div>
        </div>
        {estimateError && <p className="text-xs text-destructive">{estimateError}</p>}

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all resize-y"
            disabled={submitting}
          />
        </div>

        <div className="flex justify-end gap-3 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : "Save Task"}
          </Button>
        </div>
      </form>
    </div>
  );
}
