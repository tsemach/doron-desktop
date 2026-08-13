import { ListChecks } from "lucide-react";
import type { ImportantTask, TaskUrgency } from "../../../lib/dashboard/types";
import { formatDashboardTimestamp } from "../../../lib/dashboard/formatDate";
import DashboardCard from "@/components/app/dashboard/DashboardCard";
import StatusRail from "@/components/app/dashboard/StatusRail";

const URGENCY_RAIL_COLOR: Record<TaskUrgency, "rose" | "amber" | "slate"> = {
  overdue: "rose",
  "due-today": "amber",
  upcoming: "slate",
};

type ImportantTasksCardProps = {
  tasks: ImportantTask[];
};

export default function ImportantTasksCard({ tasks }: ImportantTasksCardProps) {
  const [spotlight, ...rest] = tasks;

  return (
    <DashboardCard
      icon={<ListChecks className="h-4 w-4 text-muted-foreground shrink-0" />}
      title="Important Tasks"
      count={tasks.length}
      column={1}
    >
      {spotlight && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Next up</p>
          <p className="mt-1 truncate text-sm font-semibold text-foreground">{spotlight.title}</p>
          <p className="truncate text-xs text-muted-foreground">{spotlight.caseSubject}</p>
          <p className="mt-1 text-xs text-indigo-700">{formatDashboardTimestamp(spotlight.dueAt)}</p>
        </div>
      )}
      {rest.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {rest.map((task) => (
            <li key={task.id}>
              <StatusRail color={URGENCY_RAIL_COLOR[task.urgency]}>
                <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                <p className="truncate text-xs text-muted-foreground">{task.caseSubject}</p>
                <p className="text-xs text-muted-foreground">{formatDashboardTimestamp(task.dueAt)}</p>
              </StatusRail>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
