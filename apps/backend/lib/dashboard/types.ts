export interface NotificationItem {
  id: string;
  message: string;
  timestamp: string; // ISO date
  type: "email" | "document" | "case" | "system";
}
