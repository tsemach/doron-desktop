import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/context/LanguageContext";
import type { Meeting } from "@/lib/calendar/types";
import MeetingBox from "../Calendar/MeetingBox";
import type { Case, CaseStatus } from "../CaseManagement/CaseManagementTypes";
import type { CaseDetailNavigationState } from "../CaseManagement/CaseDetailLayout";

const CARD_CLASS = "rounded-md border border-border bg-muted/20 p-3";
const CARD_HEADER_CLASS = "text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2";

// Self-contained (own fetch, not the AppHomeOverview stack's shared
// Promise.all) so it can sit next to the Calendar nav tile instead of in the
// cross-case Overview column -- mirrors AppHomeRecentCases/
// AppHomeDocumentsPanel's pattern of an independently-fetching sibling next
// to its tile. Card contents/behavior unchanged from where this lived before.
export default function AppHomeTodaysMeetings() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([invoke<Meeting[]>("list_todays_meetings"), invoke<any[]>("list_cases")])
      .then(([meetingRes, caseRes]) => {
        if (!active) return;
        setMeetings(meetingRes);
        setCases(
          caseRes.map((c) => ({
            id: String(c.id),
            subject: c.subject,
            status: c.status as CaseStatus,
            name: c.name,
            createdAt: c.created_at ? c.created_at.split("T")[0] : "—",
            tags: c.tags || [],
          }))
        );
      })
      .catch((err) => console.error("Failed to load today's meetings:", err))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function goToCase(caseId: string | number, state?: CaseDetailNavigationState) {
    navigate(`/case-management/cases/${caseId}`, state ? { state } : undefined);
  }

  const casesById = new Map(cases.map((c) => [c.id, c]));

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
          <div className="max-h-56 overflow-y-auto space-y-1.5 p-1">
            {[...meetings]
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
              .map((meeting) => {
                const linkedCase = meeting.case_id != null ? casesById.get(String(meeting.case_id)) : undefined;
                return (
                  <MeetingBox
                    key={meeting.id}
                    meeting={meeting}
                    caseLabel={linkedCase ? linkedCase.subject || linkedCase.name : undefined}
                    onClick={linkedCase ? () => goToCase(linkedCase.id, { initialTab: "meetings" }) : undefined}
                  />
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
