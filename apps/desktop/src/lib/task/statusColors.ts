import { TaskStatus } from "./types";

// Same palette as TaskStatusBadge's Tailwind classes, expressed as concrete
// colors for contexts that can't take Tailwind classes -- native <option>
// elements only reliably respect inline color/backgroundColor, not utility
// classes or dark-mode variants.
export const STATUS_OPTION_COLORS: Record<TaskStatus, { color: string; backgroundColor: string }> = {
  "Waiting": { color: "#3f3f46", backgroundColor: "#f4f4f5" }, // zinc-700 / zinc-100
  "In progress": { color: "#a16207", backgroundColor: "#fef9c3" }, // yellow-700 / yellow-100
  "Cancel": { color: "#6b7280", backgroundColor: "#f3f4f6" }, // gray-500 / gray-100
  "Done": { color: "#15803d", backgroundColor: "#dcfce7" }, // green-700 / green-100
};
