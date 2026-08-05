import { TaskStatus } from "@/lib/task/types";
import { STATUS_OPTION_COLORS } from "@/lib/task/statusColors";

const STATUS_FILTER_OPTIONS: Array<TaskStatus | "all"> = ["all", "Waiting", "In progress", "Cancel", "Done"];

interface TaskStatusFilterSelectProps {
  value: TaskStatus | "all";
  onChange: (value: TaskStatus | "all") => void;
}

// Same color treatment as TaskStatusSelect (status-change dropdown), for the
// "All statuses" filter used on the case Tasks tab and the dashboard. "all"
// has no status color of its own, so it -- and the closed select while it's
// selected -- stay neutral; a real status colors both the closed select and
// its own row in the open list.
export default function TaskStatusFilterSelect({ value, onChange }: TaskStatusFilterSelectProps) {
  const colors = value === "all" ? undefined : STATUS_OPTION_COLORS[value];

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TaskStatus | "all")}
        style={colors}
        className="rounded-md border-0 shadow-[0_0_0_1px_var(--border)] bg-background pl-2 pr-7 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring appearance-none cursor-pointer"
      >
        {STATUS_FILTER_OPTIONS.map((s) => (
          <option key={s} value={s} style={s === "all" ? undefined : STATUS_OPTION_COLORS[s]}>
            {s === "all" ? "All statuses" : s}
          </option>
        ))}
      </select>
      <div
        className="absolute inset-y-0 right-2 flex items-center pointer-events-none text-muted-foreground"
        style={colors ? { color: colors.color } : undefined}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </div>
  );
}
