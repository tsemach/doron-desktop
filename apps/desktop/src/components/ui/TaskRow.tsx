import { memo } from "react";
import { Task, TaskStatus } from "@/lib/task/types";
import { formatEstimateShorthand } from "@/lib/task/estimate";
import { getTaskUrgency } from "@/lib/task/taskUrgency";
import TaskStatusBadge from "./TaskStatusBadge";

const STATUS_OPTIONS: TaskStatus[] = ["Waiting", "In progress", "Cancel", "Done"];

const DUE_DATE_STYLES: Record<string, string> = {
  overdue: "text-destructive font-medium",
  "due-today": "text-amber-600 dark:text-amber-400 font-medium",
  upcoming: "text-muted-foreground",
  none: "text-muted-foreground",
};

interface TaskRowProps {
  task: Task;
  caseLabel?: string;
  onStatusChange: (id: number, status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: number) => void;
}

function formatDueDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

function TaskRowComponent({ task, caseLabel, onStatusChange, onEdit, onDelete }: TaskRowProps) {
  const urgency = getTaskUrgency(task.due_date, task.status);

  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded-md border border-border bg-muted/20">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground truncate" title={task.title}>
            {task.title}
          </span>
          <TaskStatusBadge status={task.status} />
          {task.estimate_value !== null && task.estimate_unit !== null && (
            <span className="text-xs font-mono bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 border border-border shrink-0">
              {formatEstimateShorthand(task.estimate_value, task.estimate_unit)}
            </span>
          )}
          {caseLabel && (
            <span className="text-xs text-muted-foreground italic truncate" title={caseLabel}>
              {caseLabel}
            </span>
          )}
        </div>

        {task.due_date && (
          <p className={`text-xs ${DUE_DATE_STYLES[urgency]}`}>Due {formatDueDate(task.due_date)}</p>
        )}

        {task.description && (
          <p className="text-xs text-muted-foreground whitespace-pre-line">{task.description}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <div className="relative">
          <select
            value={task.status}
            onChange={(e) => onStatusChange(task.id, e.target.value as TaskStatus)}
            className="rounded border-0 shadow-[0_0_0_1px_var(--border)] bg-background pl-1.5 pr-5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer"
            title="Change status"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-1.5 flex items-center pointer-events-none text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
        <button
          onClick={() => onEdit(task)}
          className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-all cursor-pointer"
          title="Edit task"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="p-1 text-muted-foreground hover:text-destructive hover:bg-accent rounded transition-all cursor-pointer"
          title="Delete task"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Rows are memoized since a case's/dashboard's task list can be long and
// unrelated state (e.g. which row is being edited) shouldn't re-render every
// row -- callers must pass stable (useCallback'd) onStatusChange/onEdit/onDelete
// references, which useTaskList already provides.
export default memo(TaskRowComponent);
