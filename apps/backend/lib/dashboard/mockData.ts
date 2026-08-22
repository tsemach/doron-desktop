import type { NotificationItem } from "./types";

export const mockNotifications: NotificationItem[] = [
  { id: "notif-1", message: "New email matched to תביעה בגין רשלנות", timestamp: "2026-08-12T08:15:00Z", type: "email" },
  { id: "notif-2", message: "Document upload complete for בדיקת ניהול משימות", timestamp: "2026-08-11T17:40:00Z", type: "document" },
  { id: "notif-3", message: "Case status updated: מכירת דירה בנאמנות marked closed", timestamp: "2026-08-10T12:05:00Z", type: "case" },
  { id: "notif-4", message: "Scheduled maintenance completed successfully", timestamp: "2026-08-09T03:00:00Z", type: "system" },
];
