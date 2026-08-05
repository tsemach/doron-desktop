import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTaskList } from "@/hooks/useTaskList";
import TaskList from "@/components/ui/TaskList";
import { Task, TaskStatus, TaskWithCase } from "@/lib/task/types";
import { getTaskUrgency } from "@/lib/task/taskUrgency";

const STATUS_FILTER_OPTIONS: Array<TaskStatus | "all"> = ["all", "Waiting", "In progress", "Cancel", "Done"];

function getCaseLabel(task: Task): string {
  const withCase = task as TaskWithCase;
  return withCase.case_subject || withCase.case_name;
}

export default function TaskManagementDashboard() {
  const {
    tasks,
    loading,
    error,
    pendingDeleteId,
    changeStatus,
    removeTask,
    setPendingDelete,
  } = useTaskList<TaskWithCase>(() => invoke<TaskWithCase[]>("list_all_tasks"), "all");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");

  const urgentTasks = useMemo(
    () => tasks.filter((t) => {
      const urgency = getTaskUrgency(t.due_date, t.status);
      return urgency === "overdue" || urgency === "due-today";
    }),
    [tasks]
  );

  const inProgressTasks = useMemo(
    () => tasks.filter((t) => t.status === "In progress"),
    [tasks]
  );

  const filteredTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (!query) return true;
      return t.title.toLowerCase().includes(query) || getCaseLabel(t).toLowerCase().includes(query);
    });
  }, [tasks, statusFilter, search]);

  const taskPendingDelete = tasks.find((t) => t.id === pendingDeleteId) ?? null;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-2">
          <div className="animate-spin text-2xl font-bold">⟳</div>
          <p className="text-sm">Loading tasks...</p>
        </div>
      ) : (
        <>
          {urgentTasks.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-destructive">
                Urgent ({urgentTasks.length})
              </h2>
              <TaskList
                tasks={urgentTasks}
                getCaseLabel={getCaseLabel}
                onStatusChange={changeStatus}
                onDelete={setPendingDelete}
              />
            </section>
          )}

          {inProgressTasks.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                In Progress ({inProgressTasks.length})
              </h2>
              <TaskList
                tasks={inProgressTasks}
                getCaseLabel={getCaseLabel}
                onStatusChange={changeStatus}
                onDelete={setPendingDelete}
              />
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                All Tasks ({filteredTasks.length})
              </h2>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search title or case..."
                  className="rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring transition-all w-56"
                />
                <div className="relative">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "all")}
                    className="rounded-md border-0 shadow-[0_0_0_1px_var(--border)] bg-background pl-2 pr-7 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer"
                  >
                    {STATUS_FILTER_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-muted-foreground">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
            <TaskList
              tasks={filteredTasks}
              getCaseLabel={getCaseLabel}
              onStatusChange={changeStatus}
              onDelete={setPendingDelete}
              emptyMessage="No tasks match your filters."
            />
          </section>
        </>
      )}

      {taskPendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-card border border-border rounded-lg shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-foreground">Delete Task?</h3>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <strong className="text-foreground">"{taskPendingDelete.title}"</strong>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <button
                onClick={() => setPendingDelete(null)}
                className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await removeTask(taskPendingDelete.id);
                  setPendingDelete(null);
                }}
                className="rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 px-3 py-1.5 text-xs font-medium transition-colors"
              >
                Delete Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
