import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/button";
import { Meeting } from "@/lib/calendar/types";
import { MeetingFormValues } from "@/hooks/useMeetingList";
import { useLanguage } from "../../context/LanguageContext";

interface CaseOption {
  id: number;
  name: string;
  subject: string | null;
}

interface MeetingFormProps {
  mode: "create" | "edit";
  initialMeeting?: Meeting | null;
  // Pre-selects a case (e.g. opened from a case's Meetings panel in PR-5) --
  // still just the initial value of the picker below, not a hidden/locked field.
  initialCaseId?: number | null;
  onSave: (values: MeetingFormValues) => Promise<void>;
  onCancel: () => void;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toTimeInputValue(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function combine(date: string, time: string): Date {
  return new Date(`${date}T${time}`);
}

const DEFAULT_DURATION_MS = 60 * 60 * 1000;

export default function MeetingForm({ mode, initialMeeting, initialCaseId, onSave, onCancel }: MeetingFormProps) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(initialMeeting?.title ?? "");
  const [description, setDescription] = useState(initialMeeting?.description ?? "");
  const [location, setLocation] = useState(initialMeeting?.location ?? "");

  // Create mode with no initial meeting: default start = now, end = start +
  // 60min. Edit mode: derived from the existing meeting's own times.
  const [initialStart] = useState(() => (initialMeeting ? new Date(initialMeeting.start_time) : new Date()));
  const [initialEnd] = useState(() => (initialMeeting ? new Date(initialMeeting.end_time) : new Date(initialStart.getTime() + DEFAULT_DURATION_MS)));

  const [startDate, setStartDate] = useState(toDateInputValue(initialStart));
  const [startTimeOfDay, setStartTimeOfDay] = useState(toTimeInputValue(initialStart));
  const [endDate, setEndDate] = useState(toDateInputValue(initialEnd));
  const [endTimeOfDay, setEndTimeOfDay] = useState(toTimeInputValue(initialEnd));
  // Once true, changing start no longer auto-shifts end -- keeps the
  // 60-minute default from fighting a duration the user set on purpose.
  // Starts true in edit mode: an existing meeting's duration is already
  // meaningful and shouldn't shift just because start was nudged.
  const [endTouched, setEndTouched] = useState(mode === "edit");

  const [caseId, setCaseId] = useState<number | null>(initialMeeting?.case_id ?? initialCaseId ?? null);
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function syncEndToStart(date: string, time: string) {
    const start = combine(date, time);
    if (Number.isNaN(start.getTime())) return;
    const end = new Date(start.getTime() + DEFAULT_DURATION_MS);
    setEndDate(toDateInputValue(end));
    setEndTimeOfDay(toTimeInputValue(end));
  }
  function handleStartDateChange(value: string) {
    setStartDate(value);
    setTimeError(null);
    if (!endTouched) syncEndToStart(value, startTimeOfDay);
  }
  function handleStartTimeChange(value: string) {
    setStartTimeOfDay(value);
    setTimeError(null);
    if (!endTouched) syncEndToStart(startDate, value);
  }
  function handleEndDateChange(value: string) {
    setEndDate(value);
    setEndTouched(true);
    setTimeError(null);
  }
  function handleEndTimeChange(value: string) {
    setEndTimeOfDay(value);
    setEndTouched(true);
    setTimeError(null);
  }

  useEffect(() => {
    invoke<CaseOption[]>("list_cases")
      .then(setCases)
      .catch((err) => console.error("Failed to load cases:", err));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError(t("calendar_error_title_required"));
      return;
    }
    const start = combine(startDate, startTimeOfDay);
    const end = combine(endDate, endTimeOfDay);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setTimeError(t("calendar_error_invalid_times"));
      return;
    }

    setSubmitting(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        caseId,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-card border border-border rounded-lg shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200"
      >
        <h3 className="text-lg font-bold text-foreground">
          {mode === "create" ? t("calendar_add_meeting") : t("calendar_edit_meeting")}
        </h3>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("calendar_field_title")}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleError(null);
            }}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
            disabled={submitting}
            autoFocus
          />
          {titleError && <p className="text-xs text-destructive">{titleError}</p>}
        </div>

        <div className="flex gap-4">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("calendar_field_start")}</label>
            <div className="flex gap-1.5">
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="flex-1 min-w-0 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                disabled={submitting}
              />
              <input
                type="time"
                value={startTimeOfDay}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                className="w-24 shrink-0 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                disabled={submitting}
              />
            </div>
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("calendar_field_end")}</label>
            <div className="flex gap-1.5">
              <input
                type="date"
                value={endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="flex-1 min-w-0 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                disabled={submitting}
              />
              <input
                type="time"
                value={endTimeOfDay}
                onChange={(e) => handleEndTimeChange(e.target.value)}
                className="w-24 shrink-0 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                disabled={submitting}
              />
            </div>
          </div>
        </div>
        {timeError && <p className="text-xs text-destructive">{timeError}</p>}

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("calendar_field_location")}</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t("calendar_field_location_placeholder")}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all"
            disabled={submitting}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("calendar_field_case")}</label>
          <select
            value={caseId ?? ""}
            onChange={(e) => setCaseId(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all appearance-none cursor-pointer"
            disabled={submitting}
          >
            <option value="">{t("calendar_field_case_none")}</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.subject || c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("calendar_field_description")}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("calendar_field_description_placeholder")}
            rows={3}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all resize-y"
            disabled={submitting}
          />
          <p className="text-[10px] text-muted-foreground">{t("calendar_field_description_hint")}</p>
        </div>

        <div className="flex justify-end gap-3 border-t border-border pt-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? t("saving") : t("save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
