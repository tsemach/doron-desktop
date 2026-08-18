import { Meeting } from "@/lib/calendar/types";
import TimeGrid from "./TimeGrid";

interface DayGridProps {
  currentDate: Date;
  meetings: Meeting[];
  onSelectMeeting: (meeting: Meeting) => void;
}

export default function DayGrid({ currentDate, meetings, onSelectMeeting }: DayGridProps) {
  return <TimeGrid days={[currentDate]} meetings={meetings} onSelectMeeting={onSelectMeeting} />;
}
