import { memo, useEffect, useRef, useState } from "react";
import { Task, TaskStatus } from "@/lib/task/types";
import { formatEstimateShorthand } from "@/lib/task/estimate";
import { getTaskUrgency } from "@/lib/task/taskUrgency";
import { STATUS_OPTION_COLORS } from "@/lib/task/statusColors";
import TaskStatusBadge from "./TaskStatusBadge";
import TaskStatusSelect from "./TaskStatusSelect";

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
  // Omitted on views that don't support editing (e.g. the dashboard, which
  // per design only reuses status-change/delete) -- the edit button hides.
  onEdit?: (task: Task) => void;
  onDelete: (id: number) => void;
  // Omitted (default false) on views without manual reordering -- the drag
  // handle hides and the row isn't a drop target.
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: (id: number) => void;
  onDragEnd?: () => void;
  onDrop?: (id: number) => void;
  // Selection drives the move-up/down controls, which live outside this row
  // (in the panel header) -- omitted on views without manual reordering.
  isSelected?: boolean;
  onSelect?: (id: number) => void;
}

function formatDueDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

function TaskRowComponent({
  task,
  caseLabel,
  onStatusChange,
  onEdit,
  onDelete,
  draggable = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
  onDrop,
  isSelected = false,
  onSelect,
}: TaskRowProps) {
  const urgency = getTaskUrgency(task.due_date, task.status);
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);
  // A drag gesture fires the same mousedown/mouseup sequence as a click, so
  // the box being both a click target (expand toggle) and a drag source
  // would otherwise also flip the description open on every drag attempt.
  const didDragRef = useRef(false);

  useEffect(() => {
    const el = descRef.current;
    if (!el || expanded) return;
    setIsOverflowing(el.scrollWidth > el.clientWidth);
  }, [task.description, expanded]);

  return (
    <div
      className={`flex items-center gap-2 ${isDragging ? "opacity-40" : ""}`}
      onDragOver={
        draggable
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }
          : undefined
      }
      onDrop={
        draggable
          ? (e) => {
              e.preventDefault();
              onDrop?.(task.id);
            }
          : undefined
      }
    >
      <span
        className="size-2 rounded-full shrink-0"
        style={{
          backgroundColor: STATUS_OPTION_COLORS[task.status].color,
          boxShadow: `0 0 0 3px ${STATUS_OPTION_COLORS[task.status].backgroundColor}`,
        }}
        title={task.status}
      />
      <div
        draggable={draggable}
        onDragStart={
          draggable
            ? (e) => {
                didDragRef.current = true;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(task.id));
                onDragStart?.(task.id);
              }
            : undefined
        }
        onDragEnd={draggable ? () => onDragEnd?.() : undefined}
        onClick={() => {
          if (didDragRef.current) {
            didDragRef.current = false;
            return;
          }
          onSelect?.(task.id);
          if (task.description) setExpanded((e) => !e);
        }}
        className={`flex-1 min-w-0 flex items-start justify-between gap-3 p-3 rounded-md border bg-muted/20 ${
          isSelected ? "border-primary ring-2 ring-primary/40 bg-primary/5" : "border-border"
        } ${task.description ? "cursor-pointer hover:bg-muted/40 transition-colors" : ""} ${
          draggable ? "cursor-grab active:cursor-grabbing select-none" : ""
        }`}
      >
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
            <p
              ref={descRef}
              dir="auto"
              className={`text-xs text-muted-foreground ${
                expanded
                  ? "whitespace-pre-line"
                  : `whitespace-nowrap overflow-hidden ${
                      isOverflowing
                        ? "[mask-image:linear-gradient(to_left,black_85%,transparent_100%)] [&:dir(rtl)]:[mask-image:linear-gradient(to_right,black_85%,transparent_100%)]"
                        : ""
                    }`
              }`}
            >
              {task.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <TaskStatusSelect
            value={task.status}
            onChange={(status) => onStatusChange(task.id, status)}
            title="Change status"
          />
          {onEdit && (
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
          )}
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
    </div>
  );
}

// Rows are memoized since a case's/dashboard's task list can be long and
// unrelated state (e.g. which row is being edited) shouldn't re-render every
// row -- callers must pass stable (useCallback'd) onStatusChange/onEdit/onDelete
// references, which useTaskList already provides.
export default memo(TaskRowComponent);
