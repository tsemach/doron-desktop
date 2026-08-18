import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { format, isToday } from "date-fns";
import { enUS, he } from "date-fns/locale";
import { Meeting } from "@/lib/calendar/types";
import { useLanguage } from "../../context/LanguageContext";

interface TimeGridProps {
  // One Date for the day view, seven for the week view -- the only
  // difference between the two is how many columns this renders.
  days: Date[];
  meetings: Meeting[];
  onSelectMeeting: (meeting: Meeting) => void;
}

const HOUR_HEIGHT = 48; // px
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_COLUMN_WIDTH = 56; // px -- shared by header spacer and hour labels, must match exactly
const HEADER_HEIGHT = 56; // px -- must match the header row's own height below
const DAY_COLUMN_MIN_WIDTH = 110; // px
// Scrolls to this hour on mount so the grid doesn't open on empty
// midnight-to-dawn hours -- doesn't hide anything, just where it starts.
const DEFAULT_SCROLL_HOUR = 8;

function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

interface LaidOutMeeting {
  meeting: Meeting;
  column: number;
  columnCount: number;
}

/// Side-by-side overlap layout, the standard greedy column-assignment
/// approach: walk meetings in start-time order, place each in the first
/// column whose previous occupant has already ended, opening a new column
/// otherwise. Meetings are grouped into independent "clusters" (runs of
/// mutually-overlapping meetings, separated by a gap with nothing active) so
/// a cluster of 2 gets half-width columns while an unrelated cluster of 4
/// elsewhere in the same day isn't forced to share that width.
function layoutOverlaps(dayMeetings: Meeting[]): LaidOutMeeting[] {
  const sorted = [...dayMeetings].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime() || new Date(a.end_time).getTime() - new Date(b.end_time).getTime()
  );

  const results: LaidOutMeeting[] = [];
  let cluster: LaidOutMeeting[] = [];
  let clusterEnd = -Infinity;
  let columnEndTimes: number[] = [];

  function flushCluster() {
    if (cluster.length === 0) return;
    const columnCount = Math.max(...cluster.map((c) => c.column)) + 1;
    for (const c of cluster) c.columnCount = columnCount;
    results.push(...cluster);
    cluster = [];
  }

  for (const meeting of sorted) {
    const start = new Date(meeting.start_time).getTime();
    const end = new Date(meeting.end_time).getTime();

    if (start >= clusterEnd) {
      flushCluster();
      columnEndTimes = [];
      clusterEnd = -Infinity;
    }

    let column = columnEndTimes.findIndex((t) => t <= start);
    if (column === -1) column = columnEndTimes.length;
    columnEndTimes[column] = end;
    clusterEnd = Math.max(clusterEnd, end);

    cluster.push({ meeting, column, columnCount: 1 });
  }
  flushCluster();

  return results;
}

export default function TimeGrid({ days, meetings, onSelectMeeting }: TimeGridProps) {
  const { t, language } = useLanguage();
  const locale = language === "he" ? he : enUS;
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = HEADER_HEIGHT + DEFAULT_SCROLL_HOUR * HOUR_HEIGHT;
    }
    // Mount only -- a user scrolling manually shouldn't get yanked back when
    // the meetings list refreshes (e.g. after creating a meeting).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function meetingsForDay(day: Date): Meeting[] {
    return meetings.filter((m) => isSameCalendarDay(new Date(m.start_time), day));
  }
  function topFor(iso: string): number {
    return (minutesSinceMidnight(new Date(iso)) / 60) * HOUR_HEIGHT;
  }
  function heightFor(meeting: Meeting): number {
    const minutes = (new Date(meeting.end_time).getTime() - new Date(meeting.start_time).getTime()) / 60000;
    return Math.max((minutes / 60) * HOUR_HEIGHT, 18);
  }

  return (
    <div className="h-full w-full flex flex-col border border-border rounded-md overflow-hidden bg-background">
      {/* Single scroll container for BOTH axes, with a sticky header inside
          it -- header and body day columns are children of the exact same
          flex row width computation, so they can never drift apart the way
          two separately-laid-out rows can once a vertical scrollbar eats
          into one of them but not the other. */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
        <div style={{ minWidth: HOUR_COLUMN_WIDTH + days.length * DAY_COLUMN_MIN_WIDTH }}>
          <div className="sticky top-0 z-10 flex bg-background border-b border-border">
            <div style={{ width: HOUR_COLUMN_WIDTH, height: HEADER_HEIGHT }} className="shrink-0" />
            {days.map((day) => (
              <div
                key={day.toISOString()}
                style={{ minWidth: DAY_COLUMN_MIN_WIDTH, height: HEADER_HEIGHT }}
                className={`flex-1 flex flex-col items-center justify-center border-r border-border last:border-r-0 ${isToday(day) ? "text-primary" : "text-foreground"}`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{format(day, "EEE", { locale })}</div>
                <div className="text-sm font-semibold">{format(day, "d")}</div>
              </div>
            ))}
          </div>

          <div className="flex" style={{ height: HOUR_HEIGHT * 24 }}>
            <div style={{ width: HOUR_COLUMN_WIDTH }} className="shrink-0 relative border-r border-border bg-muted/20">
              {HOURS.map((h) => (
                <div key={h} className="absolute left-0 right-0 border-t border-border/50" style={{ top: h * HOUR_HEIGHT }}>
                  {h !== 0 && <span className="absolute -top-2 right-1.5 text-[10px] text-muted-foreground">{`${String(h).padStart(2, "0")}:00`}</span>}
                </div>
              ))}
            </div>

            {days.map((day) => (
              <div key={day.toISOString()} style={{ minWidth: DAY_COLUMN_MIN_WIDTH }} className="flex-1 relative border-r border-border last:border-r-0">
                {HOURS.map((h) => (
                  <div key={h} className="absolute left-0 right-0 border-t border-border/50" style={{ top: h * HOUR_HEIGHT }} />
                ))}
                {layoutOverlaps(meetingsForDay(day)).map(({ meeting, column, columnCount }) => {
                  const widthPercent = 100 / columnCount;
                  const leftPercent = column * widthPercent;
                  return (
                    <div
                      key={meeting.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectMeeting(meeting)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") onSelectMeeting(meeting);
                      }}
                      className="absolute rounded border border-rose-200/60 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors px-1.5 py-1 overflow-hidden cursor-pointer flex flex-col items-center justify-center gap-1 text-center"
                      style={{
                        top: topFor(meeting.start_time),
                        height: heightFor(meeting),
                        left: `calc(${leftPercent}% + 2px)`,
                        width: `calc(${widthPercent}% - 4px)`,
                      }}
                      title={meeting.title}
                    >
                      <div className="text-xs font-semibold text-rose-700 dark:text-rose-300 truncate" dir="auto">
                        {meeting.title}
                      </div>
                      {meeting.case_id != null && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/case-management/cases/${meeting.case_id}`, { state: { initialTab: "meetings" } });
                          }}
                          className="rounded-full border border-gray-400 dark:border-gray-500 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors px-2 py-0.5 text-[10px] font-medium text-black cursor-pointer"
                        >
                          {t("go_to_case")}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
