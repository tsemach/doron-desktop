import { eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns";
import { enUS, he } from "date-fns/locale";
import { Meeting } from "@/lib/calendar/types";
import { useLanguage } from "../../context/LanguageContext";

interface MonthGridProps {
  currentDate: Date;
  meetings: Meeting[];
  onSelectMeeting: (meeting: Meeting) => void;
}

const MAX_VISIBLE_PER_DAY = 3;

export default function MonthGrid({ currentDate, meetings, onSelectMeeting }: MonthGridProps) {
  const { t, language } = useLanguage();
  const locale = language === "he" ? he : enUS;
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentDate), { locale }),
    end: endOfWeek(endOfMonth(currentDate), { locale }),
  });
  const weekdayLabels = eachDayOfInterval({ start: startOfWeek(currentDate, { locale }), end: endOfWeek(currentDate, { locale }) }).map((d) =>
    format(d, "EEE", { locale })
  );

  const weeks = days.length / 7;

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-7 gap-px bg-border rounded-t-md overflow-hidden border border-b-0 border-border shrink-0">
        {weekdayLabels.map((label) => (
          <div key={label} className="bg-muted/40 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">
            {label}
          </div>
        ))}
      </div>
      <div
        className="flex-1 grid grid-cols-7 gap-px bg-border rounded-b-md overflow-hidden border border-t-0 border-border"
        style={{ gridTemplateRows: `repeat(${weeks}, 1fr)` }}
      >
        {days.map((day) => {
          const dayMeetings = meetings
            .filter((m) => isSameDay(new Date(m.start_time), day))
            .sort((a, b) => a.start_time.localeCompare(b.start_time));
          const overflow = dayMeetings.length - MAX_VISIBLE_PER_DAY;

          return (
            <div
              key={day.toISOString()}
              className={`bg-background h-full overflow-hidden p-1.5 space-y-1 ${isSameMonth(day, currentDate) ? "" : "opacity-40"}`}
            >
              <div className={`text-[11px] font-semibold ${isToday(day) ? "text-primary" : "text-muted-foreground"}`}>
                {format(day, "d")}
              </div>
              {dayMeetings.slice(0, MAX_VISIBLE_PER_DAY).map((meeting) => (
                <button
                  key={meeting.id}
                  type="button"
                  onClick={() => onSelectMeeting(meeting)}
                  className="w-full text-left rounded bg-rose-100 dark:bg-rose-950/40 hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-300 truncate cursor-pointer"
                  title={meeting.title}
                  dir="auto"
                >
                  {meeting.title}
                </button>
              ))}
              {overflow > 0 && (
                <div className="text-[10px] text-muted-foreground px-1.5">{t("calendar_more_meetings").replace("{count}", String(overflow))}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
