import { eachDayOfInterval, endOfWeek, startOfWeek } from "date-fns";
import { enUS, he } from "date-fns/locale";
import { Meeting } from "@/lib/calendar/types";
import TimeGrid from "./TimeGrid";
import { useLanguage } from "../../context/LanguageContext";

interface WeekGridProps {
  currentDate: Date;
  meetings: Meeting[];
  onSelectMeeting: (meeting: Meeting) => void;
}

export default function WeekGrid({ currentDate, meetings, onSelectMeeting }: WeekGridProps) {
  const { language } = useLanguage();
  const locale = language === "he" ? he : enUS;
  const days = eachDayOfInterval({ start: startOfWeek(currentDate, { locale }), end: endOfWeek(currentDate, { locale }) });

  return <TimeGrid days={days} meetings={meetings} onSelectMeeting={onSelectMeeting} />;
}
