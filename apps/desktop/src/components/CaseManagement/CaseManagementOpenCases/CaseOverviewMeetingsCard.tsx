import { invoke } from "@tauri-apps/api/core";
import { useLanguage } from "@/context/LanguageContext";
import { useMeetingList } from "@/hooks/useMeetingList";
import { Meeting } from "@/lib/calendar/types";

interface CaseOverviewMeetingsCardProps {
  caseId: number;
  onViewAll: () => void;
}

function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateStr = start.toLocaleDateString([], { month: "short", day: "numeric" });
  const startTime = start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const endTime = end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (start.toDateString() === end.toDateString()) {
    return `${dateStr}, ${startTime} – ${endTime}`;
  }
  const endDateStr = end.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${dateStr} ${startTime} – ${endDateStr} ${endTime}`;
}

export default function CaseOverviewMeetingsCard({ caseId, onViewAll }: CaseOverviewMeetingsCardProps) {
  const { t } = useLanguage();
  const { meetings, loading, error } = useMeetingList(() => invoke<Meeting[]>("list_meetings_for_case", { caseId }), caseId);

  const upcoming = meetings.filter((m) => new Date(m.end_time) >= new Date()).sort((a, b) => a.start_time.localeCompare(b.start_time));

  return (
    <div
      onClick={onViewAll}
      className="rounded-md border border-rose-200/60 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/20 p-3 cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">{t("calendar")}</h4>
        {upcoming.length > 0 && (
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
      ) : upcoming.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{t("calendar_no_meetings")}</p>
      ) : (
        <div className="max-h-56 overflow-y-auto space-y-1">
          {upcoming.map((meeting) => (
            <div key={meeting.id} className="flex items-center gap-2 text-xs py-1 border-b border-rose-200/40 dark:border-rose-800/40 last:border-b-0">
              <span className="flex-1 min-w-0 truncate text-rose-700 dark:text-rose-300" title={meeting.title} dir="auto">
                {meeting.title}
              </span>
              <span className="text-[10px] text-rose-600/80 dark:text-rose-400/80 shrink-0">{formatDateRange(meeting.start_time, meeting.end_time)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
