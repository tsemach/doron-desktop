"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { Button } from "@workspace/ui";
import type { MeetingRow } from "../../../lib/calendar/crud";
import NewMeetingDialog from "./NewMeetingDialog";

const HOUR_HEIGHT = 48; // px per hour, matches desktop's TimeGrid
const HOUR_COLUMN_WIDTH = 56; // px, time-labels gutter
const HEADER_HEIGHT = 56; // px, sticky day-header row
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MAX_VISIBLE_PER_DAY = 3; // matches desktop's MonthGrid.tsx

type View = "day" | "week" | "month";

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

// Full set of days a month's grid actually displays -- from the start of
// the week containing the 1st, through the end of the week containing
// the last day of the month, so leading/trailing days from adjacent
// months (shown greyed-out, like desktop's MonthGrid.tsx) are included.
function monthGridDays(anchor: Date): Date[] {
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const lastOfMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const gridStart = startOfWeek(firstOfMonth);
  const gridEnd = startOfWeek(lastOfMonth);
  gridEnd.setDate(gridEnd.getDate() + 6);

  const days: Date[] = [];
  for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }
  return days;
}

function rangeForView(anchor: Date, view: View): { start: Date; end: Date } {
  if (view === "day") {
    const start = new Date(anchor);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }
  if (view === "week") {
    const start = startOfWeek(anchor);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }
  // month: the fetch range covers the whole displayed grid (including
  // adjacent-month padding days), not just the calendar month itself --
  // otherwise meetings on those padding days would never show up.
  const grid = monthGridDays(anchor);
  const start = grid[0];
  const end = new Date(grid[grid.length - 1]);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function rangeLabel(anchor: Date, view: View): string {
  if (view === "day") return anchor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  if (view === "month") return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const { start, end } = rangeForView(anchor, view);
  const last = new Date(end);
  last.setDate(last.getDate() - 1);
  return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${last.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

// Simplified version of desktop's TimeGrid.tsx layoutOverlaps: greedy
// column assignment so overlapping meetings render side-by-side instead
// of stacked on top of each other.
function layoutDay(dayMeetings: MeetingRow[]): { meeting: MeetingRow; column: number; columns: number }[] {
  const sorted = [...dayMeetings].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const columnEnds: number[] = [];
  const placed: { meeting: MeetingRow; column: number }[] = [];

  for (const meeting of sorted) {
    const start = new Date(meeting.startTime).getTime();
    const end = new Date(meeting.endTime).getTime();
    let column = columnEnds.findIndex((endTime) => endTime <= start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[column] = end;
    }
    placed.push({ meeting, column });
  }

  const columns = Math.max(1, columnEnds.length);
  return placed.map((p) => ({ ...p, columns }));
}

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

type CalendarViewProps = {
  initialMeetings: MeetingRow[];
  cases: { id: string; name: string }[];
};

export default function CalendarView({ initialMeetings, cases }: CalendarViewProps) {
  const router = useRouter();
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [meetings, setMeetings] = useState(initialMeetings);
  const [loading, setLoading] = useState(false);
  const [newMeetingOpen, setNewMeetingOpen] = useState(false);

  const { start, end } = useMemo(() => rangeForView(anchor, view), [anchor, view]);
  const days = useMemo(() => {
    if (view === "day") return [start];
    if (view === "week") return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    return monthGridDays(anchor);
  }, [start, view, anchor]);

  async function fetchRange() {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/calendar/range?start=${start.toISOString()}&end=${end.toISOString()}`);
      const data = await res.json();
      if (res.ok) setMeetings(data.meetings as MeetingRow[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start.getTime(), end.getTime()]);

  function navigate(delta: number) {
    const next = new Date(anchor);
    if (view === "day") next.setDate(next.getDate() + delta);
    else if (view === "week") next.setDate(next.getDate() + delta * 7);
    else next.setMonth(next.getMonth() + delta);
    setAnchor(next);
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/v1/calendar/${id}`, { method: "DELETE" });
    if (res.ok) setMeetings((prev) => prev.filter((m) => m.id !== id));
  }

  function meetingsOnDay(day: Date): MeetingRow[] {
    const dayEnd = new Date(day);
    dayEnd.setDate(dayEnd.getDate() + 1);
    return meetings
      .filter((m) => {
        const t = new Date(m.startTime);
        return t >= day && t < dayEnd;
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  // Month view lists meetings as simple title pills (no overlap-column
  // time layout, unlike day/week's hourly grid) -- layoutDay only runs
  // for the views that actually need it.
  const meetingsByDay = view === "month" ? [] : days.map((day) => layoutDay(meetingsOnDay(day)));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon-sm" onClick={() => navigate(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => navigate(1)}>
            <ChevronRight className="size-4" />
          </Button>
          <h2 className="text-sm font-bold text-foreground ml-2">{rangeLabel(anchor, view)}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchRange} className="text-muted-foreground hover:text-foreground">
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <div className="flex rounded-md border border-border overflow-hidden">
            {(["day", "week", "month"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1 text-xs capitalize ${view === v ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
              >
                {v}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setNewMeetingOpen(true)}>
            <Plus className="size-4" />
            New Meeting
          </Button>
        </div>
      </div>

      {view === "month" ? (
        <div className="flex-1 flex flex-col overflow-hidden p-3">
          <div className="grid grid-cols-7 gap-px bg-border rounded-t-md overflow-hidden border border-b-0 border-border shrink-0">
            {days.slice(0, 7).map((day) => (
              <div
                key={day.toLocaleDateString(undefined, { weekday: "short" })}
                className="bg-muted/40 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center"
              >
                {day.toLocaleDateString(undefined, { weekday: "short" })}
              </div>
            ))}
          </div>
          <div
            className="flex-1 grid grid-cols-7 gap-px bg-border rounded-b-md overflow-hidden border border-t-0 border-border"
            style={{ gridTemplateRows: `repeat(${days.length / 7}, 1fr)` }}
          >
            {days.map((day) => {
              const isToday = day.toDateString() === new Date().toDateString();
              const inMonth = day.getMonth() === anchor.getMonth();
              const dayMeetings = meetingsOnDay(day);
              const overflow = dayMeetings.length - MAX_VISIBLE_PER_DAY;
              return (
                <div key={day.toISOString()} className={`bg-background h-full overflow-hidden p-1.5 space-y-1 ${inMonth ? "" : "opacity-40"}`}>
                  <p className={`text-[11px] font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}>{day.getDate()}</p>
                  {dayMeetings.slice(0, MAX_VISIBLE_PER_DAY).map((meeting) => (
                    <button
                      key={meeting.id}
                      type="button"
                      onClick={() => meeting.caseId && router.push(`/app/cases/${meeting.caseId}`)}
                      className="w-full text-left rounded bg-rose-100 dark:bg-rose-950/40 hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-300 truncate"
                      title={meeting.title}
                    >
                      {meeting.title}
                    </button>
                  ))}
                  {overflow > 0 && <p className="text-[10px] text-muted-foreground px-1.5">+{overflow} more</p>}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
      <div className="flex-1 overflow-auto">
        <div className="flex" style={{ minWidth: HOUR_COLUMN_WIDTH + days.length * 110 }}>
          <div style={{ width: HOUR_COLUMN_WIDTH }} className="shrink-0">
            <div style={{ height: HEADER_HEIGHT }} />
            {HOURS.map((h) => (
              <div key={h} style={{ height: HOUR_HEIGHT }} className="text-[10px] text-muted-foreground text-right pr-1 -mt-2">
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {days.map((day, i) => {
            const isToday = day.toDateString() === new Date().toDateString();
            return (
              <div key={day.toISOString()} className="flex-1 min-w-[110px] border-l border-border relative">
                <div
                  style={{ height: HEADER_HEIGHT }}
                  className="sticky top-0 bg-background border-b border-border text-center py-1 z-10"
                >
                  <p className="text-[10px] uppercase text-muted-foreground">{day.toLocaleDateString(undefined, { weekday: "short" })}</p>
                  <p className={`text-sm font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>{day.getDate()}</p>
                </div>
                <div style={{ height: HOUR_HEIGHT * 24 }} className="relative">
                  {HOURS.map((h) => (
                    <div key={h} style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }} className="absolute inset-x-0 border-t border-border/40" />
                  ))}
                  {meetingsByDay[i].map(({ meeting, column, columns }) => {
                    const top = (minutesSinceMidnight(new Date(meeting.startTime)) / 60) * HOUR_HEIGHT;
                    const durationMinutes = (new Date(meeting.endTime).getTime() - new Date(meeting.startTime).getTime()) / 60000;
                    const height = Math.max(20, (durationMinutes / 60) * HOUR_HEIGHT);
                    const widthPct = 100 / columns;
                    return (
                      <div
                        key={meeting.id}
                        style={{ top, height, left: `${column * widthPct}%`, width: `${widthPct}%` }}
                        className="absolute px-0.5"
                      >
                        <div className="h-full rounded border border-rose-200/60 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 px-1.5 py-1 overflow-hidden group">
                          <p className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 truncate">{meeting.title}</p>
                          <div className="flex items-center gap-1">
                            {meeting.caseId && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/app/cases/${meeting.caseId}`);
                                }}
                                className="rounded-full border border-gray-400 bg-gray-300 hover:bg-gray-400 px-1.5 py-0.5 text-[9px] text-black"
                              >
                                Go to case
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(meeting.id);
                              }}
                              className="text-[9px] text-rose-600/60 hover:text-rose-600 opacity-0 group-hover:opacity-100"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {newMeetingOpen && (
        <NewMeetingDialog
          cases={cases}
          onClose={() => setNewMeetingOpen(false)}
          onCreated={(meeting) => {
            setMeetings((prev) => [...prev, meeting]);
            setNewMeetingOpen(false);
          }}
        />
      )}
    </div>
  );
}
