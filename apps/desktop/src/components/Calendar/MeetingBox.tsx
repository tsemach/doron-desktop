import { Meeting } from "@/lib/calendar/types";

interface MeetingBoxProps {
  meeting: Meeting;
  onClick?: () => void;
  // Optional so the same component serves both a case-scoped view (no case
  // chip needed -- the whole list is already that case's meetings) and a
  // cross-case view (grid, home "Today's Meetings" card) where the case
  // needs to be shown. Mirrors TaskRow's optional `caseLabel` prop.
  caseLabel?: string;
}

function formatTimeRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${fmt(startIso)} – ${fmt(endIso)}`;
}

export default function MeetingBox({ meeting, onClick, caseLabel }: MeetingBoxProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-md border border-rose-200/60 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 hover:border-rose-300 dark:hover:border-rose-700 transition-colors p-2 space-y-0.5 cursor-pointer"
    >
      <div className="text-[10px] font-semibold text-rose-600/80 dark:text-rose-400/80 uppercase tracking-wider">
        {formatTimeRange(meeting.start_time, meeting.end_time)}
      </div>
      <div className="text-xs font-semibold text-rose-700 dark:text-rose-300 truncate" dir="auto" title={meeting.title}>
        {meeting.title}
      </div>
      {meeting.location && (
        <div className="text-[11px] text-rose-600/70 dark:text-rose-400/70 truncate" dir="auto">
          {meeting.location}
        </div>
      )}
      {caseLabel && (
        <span className="inline-block text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5 mt-1 max-w-full truncate">
          {caseLabel}
        </span>
      )}
    </button>
  );
}
