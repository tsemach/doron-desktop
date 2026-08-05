import { TaskStatus } from "./types";

export type TaskUrgency = "overdue" | "due-today" | "upcoming" | "none";

// Terminal statuses are never "urgent" regardless of due_date -- a cancelled
// or already-done task shouldn't show up red just because its date passed.
export function getTaskUrgency(dueDate: string | null, status: TaskStatus): TaskUrgency {
  if (!dueDate) return "none";
  if (status === "Done" || status === "Cancel") return "none";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dueDate);
  target.setHours(0, 0, 0, 0);

  if (target.getTime() < today.getTime()) return "overdue";
  if (target.getTime() === today.getTime()) return "due-today";
  return "upcoming";
}
