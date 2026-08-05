import { Task, TaskStatus } from "@/lib/task/types";
import TaskRow from "./TaskRow";

interface TaskListProps {
  tasks: Task[];
  getCaseLabel?: (task: Task) => string | undefined;
  onStatusChange: (id: number, status: TaskStatus) => void;
  onEdit?: (task: Task) => void;
  onDelete: (id: number) => void;
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
  emptyMessage = "No tasks yet.",
}: TaskListProps) {
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
        />
      ))}
    </div>
  );
}
