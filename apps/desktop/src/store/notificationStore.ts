import { atom, getDefaultStore } from "jotai";
import { invoke } from "@tauri-apps/api/core";

export interface NotificationClickTarget {
  route?: string;
  windowEvent?: string;
}

export type NotificationStatus = "unread" | "read" | "closed" | "deleted";

// Mirrors the Rust NotificationRow struct's wire shape as-is (snake_case),
// same convention as Task/TaskWithCase in lib/task/types.ts.
export interface Notification {
  id: number;
  category: string;
  title: string;
  body: string;
  click_target: string | null;
  status: NotificationStatus;
  created_at: string;
  snooze_until: string | null;
}

export function parseClickTarget(raw: string | null): NotificationClickTarget | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as NotificationClickTarget;
  } catch {
    return null;
  }
}

export const notificationsAtom = atom<Notification[]>([]);
export const unreadCountAtom = atom((get) => get(notificationsAtom).filter((n) => n.status === "unread").length);

export async function loadNotifications(): Promise<void> {
  const rows = await invoke<Notification[]>("list_notifications", { statusFilter: null });
  getDefaultStore().set(notificationsAtom, rows);
}

export function upsertNotification(row: Notification): void {
  const store = getDefaultStore();
  const withoutRow = store.get(notificationsAtom).filter((n) => n.id !== row.id);
  store.set(notificationsAtom, [row, ...withoutRow]);
}

// Closing or deleting both remove a notification from this "active" list --
// "closed but still retrievable" is served separately (NotificationPanel's
// closed tab fetches list_notifications({ statusFilter: "closed" }) fresh
// on demand, Task 8), not by keeping closed rows in this atom. Any other
// status (e.g. "read") patches the row in place instead, so it stays visible
// in the Active tab and simply stops counting toward unreadCountAtom.
export async function updateNotificationStatus(id: number, status: NotificationStatus): Promise<void> {
  await invoke("update_notification_status", { id, status });
  const store = getDefaultStore();
  const current = store.get(notificationsAtom);
  if (status === "closed" || status === "deleted") {
    store.set(notificationsAtom, current.filter((n) => n.id !== id));
  } else {
    store.set(notificationsAtom, current.map((n) => (n.id === id ? { ...n, status } : n)));
  }
}

export async function snoozeNotification(id: number, until: string): Promise<void> {
  await invoke("snooze_notification", { id, until });
  const store = getDefaultStore();
  store.set(notificationsAtom, store.get(notificationsAtom).filter((n) => n.id !== id));
}
