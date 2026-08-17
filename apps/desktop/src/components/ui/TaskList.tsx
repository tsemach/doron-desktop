import { useCallback, useRef, useState } from "react";
import { Task, TaskStatus } from "@/lib/task/types";
import TaskRow from "./TaskRow";

interface TaskListProps {
  tasks: Task[];
  getCaseLabel?: (task: Task) => string | undefined;
  onStatusChange: (id: number, status: TaskStatus) => void;
  onEdit?: (task: Task) => void;
  onDelete: (id: number) => void;
  // Omitted when manual reordering doesn't apply (e.g. a filtered/searched
  // view, or a cross-case list where a single linear order has no clean
  // meaning) -- rows render without a drag handle.
  onReorder?: (orderedIds: number[]) => void;
  // Selection is owned by the caller (e.g. CaseTasksPanel), which also
  // renders the move-up/down controls that act on it, outside this list.
  selectedId?: number | null;
  onSelectTask?: (id: number) => void;
  emptyMessage?: string;
}

// Pure presentational container -- sorting/filtering is the caller's job (via
// useMemo), so this component only ever renders exactly the tasks it's given,
// in the order it's given them.
export default function TaskList({
  tasks,
  getCaseLabel,
  onStatusChange,
  onEdit,
  onDelete,
  onReorder,
  selectedId = null,
  onSelectTask,
  emptyMessage = "No tasks yet.",
}: TaskListProps) {
  const [draggedId, setDraggedId] = useState<number | null>(null);

  // Read via refs (not deps) so these callbacks stay referentially stable
  // across renders -- otherwise every TaskRow would lose its memo() every
  // time this list re-renders, not just the two rows actually involved in a
  // given drag.
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const draggedIdRef = useRef(draggedId);
  draggedIdRef.current = draggedId;

  const handleDragStart = useCallback((id: number) => setDraggedId(id), []);
  const handleDragEnd = useCallback(() => setDraggedId(null), []);

  const handleDrop = useCallback((targetId: number) => {
    const sourceId = draggedIdRef.current;
    setDraggedId(null);
    if (sourceId === null || sourceId === targetId || !onReorder) return;

    const ids = tasksRef.current.map((t) => t.id);
    const fromIndex = ids.indexOf(sourceId);
    const toIndex = ids.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, sourceId);
    onReorder(ids);
  }, [onReorder]);

  if (tasks.length === 0) {
    return <p className="text-xs text-muted-foreground italic">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          caseLabel={getCaseLabel?.(task)}
          onStatusChange={onStatusChange}
          onEdit={onEdit}
          onDelete={onDelete}
          draggable={!!onReorder}
          isDragging={draggedId === task.id}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDrop={handleDrop}
          isSelected={selectedId === task.id}
          onSelect={onSelectTask}
        />
      ))}
    </div>
  );
}
