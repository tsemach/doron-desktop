import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/context/LanguageContext";
import { Meeting } from "@/lib/calendar/types";

interface MeetingBoxProps {
  meeting: Meeting;
  onClick?: () => void;
  // Suppressed inside a case's own Meetings panel -- a "go to case" link
  // pointing at the case you're already viewing is pointless there. Home
  // page / cross-case views want it (default true).
  showCaseLink?: boolean;
}

function formatStartTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Two lines: "<start time> <title>", then (when linked to a case) a "Go to
// case" button -- self-contained navigation via meeting.case_id, not a
// parent-supplied callback, so every consumer gets it automatically.
export default function MeetingBox({ meeting, onClick, showCaseLink = true }: MeetingBoxProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) onClick();
      }}
      className="w-full rounded-md border border-rose-200/60 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 hover:border-rose-300 dark:hover:border-rose-700 transition-colors p-2 flex flex-col items-center justify-center gap-1 text-center cursor-pointer"
    >
      <div className="text-xs font-semibold text-rose-700 dark:text-rose-300 truncate w-full" dir="auto" title={meeting.title}>
        {formatStartTime(meeting.start_time)} {meeting.title}
      </div>
      {showCaseLink && meeting.case_id != null && (
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
}
