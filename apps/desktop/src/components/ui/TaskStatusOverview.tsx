import { Task, TaskStatus } from "@/lib/task/types";
import { STATUS_OPTION_COLORS } from "@/lib/task/statusColors";

// Cancel is intentionally excluded -- this is an at-a-glance progress
// overview, not a full status breakdown.
const OVERVIEW_STATUSES: { status: TaskStatus; label: string }[] = [
  { status: "Waiting", label: "Waiting" },
  { status: "In progress", label: "In Progress" },
  { status: "Done", label: "Done" },
];

interface TaskStatusOverviewProps {
  tasks: Task[];
}

// KPI row: always reflects the case's full task list, independent of
// whatever status filter is currently narrowing the list below it.
export default function TaskStatusOverview({ tasks }: TaskStatusOverviewProps) {
  const counts = tasks.reduce<Record<TaskStatus, number>>(
    (acc, t) => {
      acc[t.status] += 1;
      return acc;
    },
    { "Waiting": 0, "In progress": 0, "Cancel": 0, "Done": 0 }
  );

  return (
    <div className="grid grid-cols-3 gap-2">
      {OVERVIEW_STATUSES.map(({ status, label }) => (
        <div
          key={status}
          className="rounded-md border border-border bg-muted/20 px-3 py-2 flex items-center gap-2.5"
        >
          <span
            className="size-2.5 rounded-full shrink-0"
            style={{
              backgroundColor: STATUS_OPTION_COLORS[status].color,
              boxShadow: `0 0 0 3px ${STATUS_OPTION_COLORS[status].backgroundColor}`,
            }}
          />
          <div className="min-w-0">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
              {label}
            </div>
            <div className="text-lg font-semibold text-foreground leading-tight">{counts[status]}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
