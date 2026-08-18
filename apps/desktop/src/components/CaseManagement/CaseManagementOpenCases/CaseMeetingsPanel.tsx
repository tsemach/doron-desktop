import { invoke } from "@tauri-apps/api/core";
import { useLanguage } from "@/context/LanguageContext";
import { useMeetingList, MeetingFormValues } from "@/hooks/useMeetingList";
import { Meeting } from "@/lib/calendar/types";
import MeetingBox from "@/components/Calendar/MeetingBox";
import MeetingForm from "@/components/Calendar/MeetingForm";

interface CaseMeetingsPanelProps {
  caseId: number;
}

// "boxes view" (ASC-163 R7/R8) -- a grid of MeetingBox cards, not the
// day/week/month grid views from the main Calendar tab. Same-panel switch
// via activeRightTab, not a modal (brainstorm.md §7).
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-w-3xl">
          {meetings.map((meeting) => (
            <MeetingBox key={meeting.id} meeting={meeting} onClick={() => startEdit(meeting)} />
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
