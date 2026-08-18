import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, startOfDay, startOfMonth, startOfWeek, subDays, subMonths, subWeeks, type Locale } from "date-fns";
import { enUS, he } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import ConnectGoogleCalendarPrompt from "./ConnectGoogleCalendarPrompt";
import MonthGrid from "./MonthGrid";
import WeekGrid from "./WeekGrid";
import DayGrid from "./DayGrid";
import MeetingForm from "./MeetingForm";
import { useMeetingList, MeetingFormValues } from "@/hooks/useMeetingList";
import { CalendarViewMode, GoogleCalendarStatus, Meeting } from "@/lib/calendar/types";
import { useLanguage } from "../../context/LanguageContext";

const VIEW_MODES: CalendarViewMode[] = ["day", "week", "month"];

function rangeFor(mode: CalendarViewMode, date: Date, locale: Locale): { start: Date; end: Date } {
  if (mode === "day") return { start: startOfDay(date), end: addDays(startOfDay(date), 1) };
  if (mode === "week") return { start: startOfWeek(date, { locale }), end: addDays(endOfWeek(date, { locale }), 1) };
  return { start: startOfWeek(startOfMonth(date), { locale }), end: addDays(endOfWeek(endOfMonth(date), { locale }), 1) };
}

function shift(mode: CalendarViewMode, date: Date, direction: 1 | -1): Date {
  if (mode === "day") return direction === 1 ? addDays(date, 1) : subDays(date, 1);
  if (mode === "week") return direction === 1 ? addWeeks(date, 1) : subWeeks(date, 1);
  return direction === 1 ? addMonths(date, 1) : subMonths(date, 1);
}

export default function CalendarView() {
  const { t, language } = useLanguage();
  const locale = language === "he" ? he : enUS;
  const [status, setStatus] = useState<GoogleCalendarStatus | null | "loading">("loading");
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const loadStatus = useCallback(() => {
    invoke<GoogleCalendarStatus | null>("get_google_calendar_status")
      .then(setStatus)
      .catch((err) => {
        console.error("Failed to load Google Calendar status:", err);
        setStatus(null);
      });
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const { start, end } = useMemo(() => rangeFor(viewMode, currentDate, locale), [viewMode, currentDate, locale]);

  const fetchMeetings = useCallback(
    () => invoke<Meeting[]>("list_meetings_for_range", { start: start.toISOString(), end: end.toISOString() }),
    [start, end]
  );
  const { meetings, loading, error, editingMeeting, reload, createMeeting, updateMeeting, startCreate, startEdit, closeForm } = useMeetingList(
    fetchMeetings,
    `${viewMode}-${start.toISOString()}`
  );

  if (status === "loading") {
    return null;
  }
  if (status === null) {
    return <ConnectGoogleCalendarPrompt onConnected={loadStatus} />;
  }

  const rangeLabel = viewMode === "day" ? format(currentDate, "PPPP", { locale }) : viewMode === "week" ? `${format(start, "MMM d", { locale })} – ${format(subDays(end, 1), "MMM d", { locale })}` : format(currentDate, "MMMM yyyy", { locale });

  async function handleSave(values: MeetingFormValues) {
    if (editingMeeting && editingMeeting !== "new") {
      await updateMeeting(editingMeeting.id, values);
    } else {
      await createMeeting(values);
    }
    closeForm();
  }

  return (
    <div className="h-full flex flex-col p-6 gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => setCurrentDate((d) => shift(viewMode, d, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            {t("calendar_today")}
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => setCurrentDate((d) => shift(viewMode, d, 1))}>
            <ChevronRight className="size-4" />
          </Button>
          <h2 className="text-sm font-bold text-foreground ml-2" dir="auto">
            {rangeLabel}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={() => reload()} disabled={loading} title={t("refresh")}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <div className="flex rounded-md border border-border overflow-hidden">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  viewMode === mode ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted text-muted-foreground"
                }`}
              >
                {t(`calendar_view_${mode}`)}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={startCreate}>
            <Plus className="size-4" />
            {t("calendar_new_meeting")}
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {loading ? (
          <p className="text-xs text-muted-foreground">{t("loading")}</p>
        ) : error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <>
            {viewMode === "month" && <MonthGrid currentDate={currentDate} meetings={meetings} onSelectMeeting={startEdit} />}
            {viewMode === "week" && <WeekGrid currentDate={currentDate} meetings={meetings} onSelectMeeting={startEdit} />}
            {viewMode === "day" && <DayGrid currentDate={currentDate} meetings={meetings} onSelectMeeting={startEdit} />}
          </>
        )}
      </div>

      {editingMeeting && (
        <MeetingForm
          mode={editingMeeting === "new" ? "create" : "edit"}
          initialMeeting={editingMeeting === "new" ? null : editingMeeting}
          onSave={handleSave}
          onCancel={closeForm}
        />
      )}
    </div>
  );
}
