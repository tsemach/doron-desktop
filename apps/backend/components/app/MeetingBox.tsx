"use client";

import { useRouter } from "next/navigation";
import type { MeetingRow } from "../../lib/calendar/crud";

// Matches desktop's MeetingBox.tsx / TimeGrid meeting-block styling
// exactly (rose color scheme, "Go to case" pill), shared between Home's
// Today's Meetings panel and the Calendar grid.
export default function MeetingBox({ meeting }: { meeting: MeetingRow }) {
  const router = useRouter();

  return (
    <div className="rounded border border-rose-200/60 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 px-2 py-1.5 transition-colors">
      <p className="text-xs font-semibold text-rose-700 dark:text-rose-300 truncate">{meeting.title}</p>
      <p className="text-[10px] text-rose-600/70 dark:text-rose-400/70">
        {new Date(meeting.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </p>
      {meeting.caseId && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/app/cases/${meeting.caseId}`);
          }}
          className="mt-1 rounded-full border border-gray-400 bg-gray-300 hover:bg-gray-400 px-2 py-0.5 text-[10px] text-black"
        >
          Go to case
        </button>
      )}
    </div>
  );
}
