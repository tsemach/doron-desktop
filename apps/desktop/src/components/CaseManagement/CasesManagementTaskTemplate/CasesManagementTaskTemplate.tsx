import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TaskTemplate, TaskTemplateItem, TaskTemplateItemDraft } from "@/lib/task/types";
import TaskTemplateList from "./TaskTemplateList";
import TaskTemplateCreateForm from "./TaskTemplateCreateForm";
import TaskTemplateDetailsView from "./TaskTemplateDetailsView";
import TaskTemplateEmptyState from "./TaskTemplateEmptyState";

interface TaskTemplateItemInput {
  title: string;
  estimate_value: number;
  estimate_unit: "day" | "hour";
  description: string | null;
}

function toItemInput(item: TaskTemplateItem): TaskTemplateItemInput {
  return {
    title: item.title,
    estimate_value: item.estimate_value,
    estimate_unit: item.estimate_unit,
    description: item.description,
  };
}

export default function CasesManagementTaskTemplate() {
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const activeTemplate = taskTemplates.find((tt) => tt.id === selectedTemplateId) || null;

  const containerRef = useRef<HTMLDivElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;
      const containerLeft = containerRef.current.getBoundingClientRect().left;
      const newWidth = Math.max(200, Math.min(600, e.clientX - containerLeft));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const rows = await invoke<TaskTemplate[]>("list_task_templates");
      setTaskTemplates(rows);

      if (rows.length > 0 && selectedTemplateId === null) {
        setSelectedTemplateId(rows[0].id);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load task templates from database.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTemplate(name: string, items: TaskTemplateItemDraft[]) {
    try {
      const newId = await invoke<number>("create_task_template", {
        name,
        items: items.map((i) => ({
          title: i.title,
          estimate_value: i.estimateValue,
          estimate_unit: i.estimateUnit,
          description: i.description || null,
        })),
      });
      setSelectedTemplateId(newId);
      setIsCreating(false);
      await loadData();
    } catch (err) {
      alert(`Error creating task template: ${err}`);
      throw err;
    }
  }

  async function handleDeleteTemplate() {
    if (!selectedTemplateId) return;
    try {
      await invoke("delete_task_template", { id: selectedTemplateId });
      const remaining = taskTemplates.filter((tt) => tt.id !== selectedTemplateId);
      setSelectedTemplateId(remaining.length > 0 ? remaining[0].id : null);
      setIsCreating(false);
      await loadData();
    } catch (err) {
      alert(`Error deleting task template: ${err}`);
    }
  }

  async function handleRenameTemplate(newName: string) {
    if (!activeTemplate) return;
    try {
      await invoke("update_task_template", {
        id: activeTemplate.id,
        name: newName,
        items: activeTemplate.items.map(toItemInput),
      });
      await loadData();
    } catch (err) {
      alert(`Error renaming template: ${err}`);
    }
  }

  async function handleAddItem(item: TaskTemplateItemDraft) {
    if (!activeTemplate) return;
    try {
      await invoke("update_task_template", {
        id: activeTemplate.id,
        name: activeTemplate.name,
        items: [
          ...activeTemplate.items.map(toItemInput),
          { title: item.title, estimate_value: item.estimateValue, estimate_unit: item.estimateUnit, description: item.description || null },
        ],
      });
      await loadData();
    } catch (err) {
      alert(`Error adding task: ${err}`);
    }
  }

  async function handleUpdateItem(itemId: number, item: TaskTemplateItemDraft) {
    if (!activeTemplate) return;
    try {
      await invoke("update_task_template", {
        id: activeTemplate.id,
        name: activeTemplate.name,
        items: activeTemplate.items.map((i) =>
          i.id === itemId
            ? { title: item.title, estimate_value: item.estimateValue, estimate_unit: item.estimateUnit, description: item.description || null }
            : toItemInput(i)
        ),
      });
      await loadData();
    } catch (err) {
      alert(`Error updating task: ${err}`);
    }
  }

  async function handleRemoveItem(itemId: number) {
    if (!activeTemplate) return;
    try {
      await invoke("update_task_template", {
        id: activeTemplate.id,
        name: activeTemplate.name,
        items: activeTemplate.items.filter((i) => i.id !== itemId).map(toItemInput),
      });
      await loadData();
    } catch (err) {
      alert(`Error removing task: ${err}`);
    }
  }

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      <div className="flex items-center justify-between p-6 border-b border-border bg-card shrink-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Task Templates</h2>
          <p className="text-sm text-muted-foreground">
            Define sets of tasks that auto-attach to new cases, with due dates calculated from each task's estimate.
          </p>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive shrink-0">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground space-y-2">
          <div className="animate-spin text-primary text-2xl font-bold">⟳</div>
          <p className="text-sm">Loading templates...</p>
        </div>
      ) : (
        <div ref={containerRef} className="flex-1 flex overflow-hidden">
          <TaskTemplateList
            taskTemplates={taskTemplates}
            selectedTemplateId={selectedTemplateId}
            isCreating={isCreating}
            onSelectTemplate={(id) => {
              setSelectedTemplateId(id);
              setIsCreating(false);
            }}
            onStartCreate={() => setIsCreating(true)}
            width={sidebarWidth}
          />

          <div
            onMouseDown={startResizing}
            className={`w-[1px] bg-border shrink-0 h-full relative cursor-col-resize select-none group transition-colors duration-150 ${isResizing ? "bg-primary" : "hover:bg-primary"
              }`}
          >
            <div className="absolute top-0 bottom-0 -left-1.5 -right-1.5 cursor-col-resize z-10" />
          </div>

          <section className="flex-1 flex flex-col overflow-visible bg-background relative z-20">
            <div className="flex-1 flex flex-col overflow-y-auto p-6 min-h-0">
              {isCreating ? (
                <TaskTemplateCreateForm onSave={handleCreateTemplate} onCancel={() => setIsCreating(false)} />
              ) : activeTemplate ? (
                <TaskTemplateDetailsView
                  activeTemplate={activeTemplate}
                  onDelete={handleDeleteTemplate}
                  onRename={handleRenameTemplate}
                  onAddItem={handleAddItem}
                  onUpdateItem={handleUpdateItem}
                  onRemoveItem={handleRemoveItem}
                />
              ) : (
                <TaskTemplateEmptyState />
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
