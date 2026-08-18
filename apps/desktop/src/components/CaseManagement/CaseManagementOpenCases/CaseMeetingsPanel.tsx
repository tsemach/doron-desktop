import { invoke } from "@tauri-apps/api/core";
import { useLanguage } from "@/context/LanguageContext";
import { useMeetingList, MeetingFormValues } from "@/hooks/useMeetingList";
import { Meeting } from "@/lib/calendar/types";
import MeetingForm from "@/components/Calendar/MeetingForm";

interface CaseMeetingsPanelProps {
  caseId: number;
}

const DATE_FMT: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
const TIME_FMT: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };

function formatDateRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startTime = start.toLocaleTimeString([], TIME_FMT);
  const endTime = end.toLocaleTimeString([], TIME_FMT);
  if (start.toDateString() === end.toDateString()) {
    return `${start.toLocaleDateString([], DATE_FMT)} · ${startTime} – ${endTime}`;
  }
  return `${start.toLocaleDateString([], DATE_FMT)} ${startTime} – ${end.toLocaleDateString([], DATE_FMT)} ${endTime}`;
}

// "boxes view" (ASC-163 R7/R8), rendered as a list (most recent first), not
// the day/week/month grid views from the main Calendar tab. Same-panel
// switch via activeRightTab, not a modal (brainstorm.md §7).
export default function CaseMeetingsPanel({ caseId }: CaseMeetingsPanelProps) {
  const { t } = useLanguage();
  const { meetings, loading, error, editingMeeting, createMeeting, updateMeeting, startCreate, startEdit, closeForm } = useMeetingList(
    () => invoke<Meeting[]>("list_meetings_for_case", { caseId }),
    caseId
  );

  async function handleSave(values: MeetingFormValues) {
    if (editingMeeting && editingMeeting !== "new") {
      await updateMeeting(editingMeeting.id, values);
    } else {
      await createMeeting(values);
    }
    closeForm();
  }

  const sortedMeetings = [...meetings].sort((a, b) => b.start_time.localeCompare(a.start_time));

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {t("calendar")} ({meetings.length})
        </h4>
        <div className="rounded-lg bg-primary h-7 px-2.5 inline-flex items-center">
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex items-center gap-0.5 text-xs text-primary-foreground hover:underline hover:text-primary-foreground/80 font-medium cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline">
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
            {t("calendar_new_meeting")}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>
      )}

      {loading ? (
        <div className="text-xs text-muted-foreground">{t("loading")}</div>
      ) : meetings.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{t("calendar_no_meetings")}</p>
      ) : (
        <div className="flex flex-col gap-2 max-w-3xl">
          {sortedMeetings.map((meeting) => (
            <button
              key={meeting.id}
              type="button"
              onClick={() => startEdit(meeting)}
              className="w-full text-left rounded-md border border-rose-200/60 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 hover:border-rose-300 dark:hover:border-rose-700 transition-colors p-3 cursor-pointer"
            >
              <div className="text-[11px] font-semibold text-rose-600/80 dark:text-rose-400/80 uppercase tracking-wider">
                {formatDateRange(meeting.start_time, meeting.end_time)}
              </div>
              <div className="text-sm font-semibold text-rose-700 dark:text-rose-300 mt-1" dir="auto">
                {meeting.title}
              </div>
              {meeting.description && (
                <p className="text-xs text-rose-600/80 dark:text-rose-400/80 mt-1 whitespace-pre-line" dir="auto">
                  {meeting.description}
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {editingMeeting && (
        <MeetingForm
          mode={editingMeeting === "new" ? "create" : "edit"}
          initialMeeting={editingMeeting === "new" ? null : editingMeeting}
          initialCaseId={caseId}
          onSave={handleSave}
          onCancel={closeForm}
        />
      )}
    </div>
  );
}
