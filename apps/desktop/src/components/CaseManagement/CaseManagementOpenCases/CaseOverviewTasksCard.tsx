import { invoke } from "@tauri-apps/api/core";
import { useLanguage } from "@/context/LanguageContext";
import { useTaskList } from "@/hooks/useTaskList";
import { Task } from "@/lib/task/types";
import { STATUS_OPTION_COLORS } from "@/lib/task/statusColors";
import { formatShortDate } from "@/lib/formatShortDate";

interface CaseOverviewTasksCardProps {
  caseId: number;
  onViewAll: () => void;
}

export default function CaseOverviewTasksCard({ caseId, onViewAll }: CaseOverviewTasksCardProps) {
  const { t } = useLanguage();
  const { tasks, loading, error } = useTaskList(() => invoke<Task[]>("list_tasks_for_case", { caseId }), caseId);

  return (
    <div
      onClick={onViewAll}
      className="rounded-md border border-blue-200/60 dark:border-blue-800/60 bg-blue-50 dark:bg-blue-950/20 p-3 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">{t("tasks")}</h4>
        {tasks.length > 0 && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-[10px] font-medium text-primary hover:underline cursor-pointer"
          >
            {t("view_all_cases")} →
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">{t("loading")}</p>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{t("no_tasks_for_case")}</p>
      ) : (
        <div className="max-h-56 overflow-y-auto space-y-1">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 text-xs py-1 border-b border-border/50 last:border-b-0"
            >
              <span
                className="size-2 rounded-full shrink-0"
                style={{
                  backgroundColor: STATUS_OPTION_COLORS[task.status].color,
                  boxShadow: `0 0 0 2px ${STATUS_OPTION_COLORS[task.status].backgroundColor}`,
                }}
                title={task.status}
              />
              <span className="flex-1 min-w-0 truncate text-foreground" title={task.title} dir="auto">
                {task.title}
              </span>
              {task.due_date && (
                <span className="text-[10px] text-muted-foreground shrink-0">{formatShortDate(task.due_date)}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
