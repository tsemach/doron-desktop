export type CaseStatus = "open" | "waiting" | "closed";

export interface CaseSummary {
  id: string;
  subject: string; // bold line, e.g. "תביעה בגין רשלנות"
  client: string; // muted line below subject
  status: CaseStatus;
  updatedAt: string; // ISO date; RecentCasesList sorts by this, most recent first
}

export type StatTileIcon = "Mail" | "CalendarClock" | "Briefcase" | "ListChecks";

export interface StatTileData {
  id: string;
  icon: StatTileIcon; // lucide-react icon name, must be a key in StatTile.tsx's ICONS map
  primary: { count: number; label: string };
  secondary?: { count: number; label: string }; // e.g. "5 open cases" + "1 follow-up"
}

export interface NotificationItem {
  id: string;
  message: string;
  timestamp: string; // ISO date
  type: "email" | "document" | "case" | "system";
}
