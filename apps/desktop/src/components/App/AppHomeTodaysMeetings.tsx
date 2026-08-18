import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLanguage } from "@/context/LanguageContext";
import type { Meeting } from "@/lib/calendar/types";
import MeetingBox from "../Calendar/MeetingBox";

// h-48 matches the Calendar nav tile's own size-48 (192px) so the two sit
// flush at the same height in their row (AppHome.tsx's items-end).
const CARD_CLASS = "rounded-md border border-border bg-muted/20 p-3 h-48 flex flex-col";
const CARD_HEADER_CLASS = "text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 shrink-0";

// Self-contained (own fetch, not the AppHomeOverview stack's shared
// Promise.all) so it can sit next to the Calendar nav tile instead of in the
// cross-case Overview column -- mirrors AppHomeRecentCases/
// AppHomeDocumentsPanel's pattern of an independently-fetching sibling next
// to its tile. MeetingBox now handles its own "go to case" navigation
// (meeting.case_id), so no case fetch/lookup is needed here anymore.
export default function AppHomeTodaysMeetings() {
  const { t } = useLanguage();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    invoke<Meeting[]>("list_todays_meetings")
      .then((res) => {
        if (active) setMeetings(res);
      })
      .catch((err) => console.error("Failed to load today's meetings:", err))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="w-96">
      <div className={CARD_CLASS}>
        <h4 className={CARD_HEADER_CLASS}>
          {t("calendar_todays_meetings")} ({meetings.length})
        </h4>
        {loading ? (
          <p className="text-xs text-muted-foreground">{t("loading")}</p>
        ) : meetings.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">{t("calendar_no_meetings")}</p>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 p-1">
            {[...meetings]
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
              .map((meeting) => (
                <MeetingBox key={meeting.id} meeting={meeting} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
