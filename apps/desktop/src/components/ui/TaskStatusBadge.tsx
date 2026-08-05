import { useLanguage } from "@/context/LanguageContext";
import type { TaskStatus } from "@/lib/task/types";

const STATUS_STYLES: Record<TaskStatus, string> = {
  "Waiting": "bg-zinc-100 text-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-300",
  "In progress": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  "Cancel": "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  "Done": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

interface TaskStatusBadgeProps {
  status: TaskStatus;
  className?: string;
}

export default function TaskStatusBadge({ status, className = "" }: TaskStatusBadgeProps) {
  const { t } = useLanguage();
  const label =
    status === "Waiting" ? t("task_status_waiting") :
    status === "In progress" ? t("task_status_in_progress") :
    status === "Cancel" ? t("task_status_cancel") :
    t("task_status_done");

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]} ${className}`}>
      {label}
    </span>
  );
}
