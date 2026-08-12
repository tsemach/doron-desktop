import type { CaseSummary, NotificationItem, StatTileData } from "./types";

// 6 entries. RecentCasesList sorts by updatedAt itself and doesn't rely on
// this array's order. case-6 is deliberately the oldest entry, so the "5
// most recent" slice visibly excludes something during manual QA regardless
// of the array's actual order.
export const mockCases: CaseSummary[] = [
  { id: "case-1", subject: "תביעה בגין רשלנות", client: "צמח מזרחי", status: "open", updatedAt: "2026-08-10" },
  { id: "case-2", subject: "בדיקת ניהול משימות", client: "צמח מזרחי", status: "waiting", updatedAt: "2026-08-09" },
  { id: "case-3", subject: "Contract Review — Acme Corp", client: "Tsemach Mizracho", status: "open", updatedAt: "2026-08-08" },
  { id: "case-4", subject: "מכירת דירה בנאמנות", client: "דורון מזרחי", status: "closed", updatedAt: "2026-08-05" },
  { id: "case-5", subject: "Employment Dispute Consultation", client: "Ronit Levi", status: "open", updatedAt: "2026-08-01" },
  { id: "case-6", subject: "Trademark Registration Inquiry", client: "Noa Cohen", status: "closed", updatedAt: "2026-07-20" },
];

// Numbers match the source sketch: 6 emails, 5 meetings, 5 open cases / 1
// follow-up, 6 tasks.
export const mockStatTiles: StatTileData[] = [
  { id: "emails", icon: "Mail", primary: { count: 6, label: "Emails to handle" } },
  { id: "meetings", icon: "CalendarClock", primary: { count: 5, label: "Meetings today" } },
  { id: "cases", icon: "Briefcase", primary: { count: 5, label: "Open cases" }, secondary: { count: 1, label: "Follow-up" } },
  { id: "tasks", icon: "ListChecks", primary: { count: 6, label: "Tasks to handle" } },
];

export const mockNotifications: NotificationItem[] = [
  { id: "notif-1", message: "New email matched to תביעה בגין רשלנות", timestamp: "2026-08-12T08:15:00Z", type: "email" },
  { id: "notif-2", message: "Document upload complete for בדיקת ניהול משימות", timestamp: "2026-08-11T17:40:00Z", type: "document" },
  { id: "notif-3", message: "Case status updated: מכירת דירה בנאמנות marked closed", timestamp: "2026-08-10T12:05:00Z", type: "case" },
  { id: "notif-4", message: "Scheduled maintenance completed successfully", timestamp: "2026-08-09T03:00:00Z", type: "system" },
];
