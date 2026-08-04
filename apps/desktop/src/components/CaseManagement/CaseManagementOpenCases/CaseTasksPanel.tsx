import { invoke } from "@tauri-apps/api/core";
import { useTaskList } from "@/hooks/useTaskList";
import TaskList from "@/components/ui/TaskList";
import TaskForm, { TaskFormValues } from "@/components/ui/TaskForm";
import { Task } from "@/lib/task/types";

interface CaseTasksPanelProps {
  caseId: number;
}

export default function CaseTasksPanel({ caseId }: CaseTasksPanelProps) {
  const {
    tasks,
    loading,
    error,
    editingTask,
    pendingDeleteId,
    reload,
    changeStatus,
    removeTask,
    startCreate,
    startEdit,
    closeForm,
    setPendingDelete,
  } = useTaskList(() => invoke<Task[]>("list_tasks_for_case", { caseId }), caseId);

  async function handleSave(values: TaskFormValues) {
    try {
      if (editingTask && editingTask !== "new") {
        await invoke("update_task", {
          id: editingTask.id,
          title: values.title,
          description: values.description || null,
          estimateValue: values.estimateValue,
          estimateUnit: values.estimateUnit,
          dueDate: values.dueDate,
          status: values.status,
        });
      } else {
        await invoke("create_task", {
          caseId,
          title: values.title,
          description: values.description || null,
          estimateValue: values.estimateValue,
          estimateUnit: values.estimateUnit,
          dueDate: values.dueDate,
        });
      }
      closeForm();
      await reload();
    } catch (err) {
      alert(`Error saving task: ${err}`);
    }
  }

  const taskPendingDelete = tasks.find((t) => t.id === pendingDeleteId) ?? null;

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Tasks ({tasks.length})
        </h4>
        <div className="rounded-lg bg-primary h-7 px-2.5 inline-flex items-center">
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex items-center gap-0.5 text-xs text-primary-foreground hover:underline hover:text-primary-foreground/80 font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline">
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            Add Task
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-xs text-muted-foreground">Loading tasks...</div>
      ) : (
        <TaskList
          tasks={tasks}
          onStatusChange={changeStatus}
          onEdit={startEdit}
          onDelete={setPendingDelete}
          emptyMessage="No tasks for this case yet."
        />
      )}

      {editingTask && (
        <TaskForm
          mode={editingTask === "new" ? "create" : "edit"}
          initialTask={editingTask === "new" ? null : editingTask}
          onSave={handleSave}
          onCancel={closeForm}
        />
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
