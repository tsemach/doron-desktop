import { invoke } from "@tauri-apps/api/core";
import { useLanguage } from "@/context/LanguageContext";
import { useMeetingList } from "@/hooks/useMeetingList";
import { Meeting } from "@/lib/calendar/types";

interface CaseOverviewMeetingsCardProps {
  caseId: number;
  onViewAll: () => void;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function CaseOverviewMeetingsCard({ caseId, onViewAll }: CaseOverviewMeetingsCardProps) {
  const { t } = useLanguage();
  const { meetings, loading, error } = useMeetingList(() => invoke<Meeting[]>("list_meetings_for_case", { caseId }), caseId);

  const upcoming = meetings.filter((m) => new Date(m.end_time) >= new Date()).sort((a, b) => a.start_time.localeCompare(b.start_time));

  return (
    <div
      onClick={onViewAll}
      className="rounded-md border border-border bg-muted/20 p-3 cursor-pointer hover:bg-muted/40 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("calendar")}</h4>
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
            <div key={meeting.id} className="flex items-center gap-2 text-xs py-1 border-b border-border/50 last:border-b-0">
              <span className="flex-1 min-w-0 truncate text-foreground" title={meeting.title} dir="auto">
                {meeting.title}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0">{formatDateTime(meeting.start_time)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
