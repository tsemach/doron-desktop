import MeetingBox from "../MeetingBox";
import { CARD_CLASS, CARD_HEADER_CLASS } from "./panelStyles";
import type { MeetingRow } from "../../../lib/calendar/crud";

// Matches desktop's AppHomeTodaysMeetings.tsx structure/classes.
export default function TodaysMeetingsPanel({ meetings }: { meetings: MeetingRow[] }) {
  return (
    <div className="w-96">
      <div className={CARD_CLASS}>
        <p className={CARD_HEADER_CLASS}>Today&apos;s Meetings</p>
        <div className="flex-1 overflow-y-auto flex flex-col gap-1.5">
          {meetings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No meetings today.</p>
          ) : (
            meetings.map((m) => <MeetingBox key={m.id} meeting={m} />)
          )}
        </div>
      </div>
    </div>
  );
}
