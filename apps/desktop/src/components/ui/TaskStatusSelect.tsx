import { TaskStatus } from "@/lib/task/types";
import { STATUS_OPTION_COLORS } from "@/lib/task/statusColors";

const STATUS_OPTIONS: TaskStatus[] = ["Waiting", "In progress", "Cancel", "Done"];

interface TaskStatusSelectProps {
  value: TaskStatus;
  onChange: (status: TaskStatus) => void;
  disabled?: boolean;
  // "sm" = compact inline dropdown (task rows), "md" = full-width form field.
  size?: "sm" | "md";
  title?: string;
}

// Shared status-change dropdown for any Task view (row-inline change, the
// edit form's status field). Colors both the closed select (by the currently
// selected status) and every option in the opened list, per
// STATUS_OPTION_COLORS -- not just the option list, so the color is visible
// without opening the dropdown too.
export default function TaskStatusSelect({ value, onChange, disabled, size = "sm", title }: TaskStatusSelectProps) {
  const colors = STATUS_OPTION_COLORS[value];
  const sizeClasses =
    size === "sm"
      ? "pl-1.5 pr-5 py-1 text-xs rounded"
      : "w-full pl-3 pr-9 py-1.5 text-sm rounded-md";
  const chevronPositionClass = size === "sm" ? "right-1.5" : "right-3";
  const chevronSize = size === "sm" ? 10 : 14;

  return (
    <div className={`relative ${size === "md" ? "block w-full" : "inline-block"}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TaskStatus)}
        disabled={disabled}
        title={title}
        style={colors}
        className={`border-0 shadow-[0_0_0_1px_var(--border)] font-medium focus:outline-none focus:ring-1 focus:ring-ring appearance-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${sizeClasses}`}
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s} style={STATUS_OPTION_COLORS[s]}>
            {s}
          </option>
        ))}
      </select>
      <div
        className={`absolute inset-y-0 ${chevronPositionClass} flex items-center pointer-events-none`}
        style={{ color: colors.color }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={chevronSize}
          height={chevronSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </div>
  );
}
