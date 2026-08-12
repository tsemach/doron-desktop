"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import type { NotificationItem } from "../../../lib/dashboard/types";
import NotificationsPanel from "@/components/app/dashboard/NotificationsPanel";

type NotificationBellProps = {
  notifications: NotificationItem[];
};

export default function NotificationBell({ notifications }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const visibleNotifications = notifications.filter((n) => !dismissedIds.includes(n.id));
  const unreadCount = visibleNotifications.length;

  function handleDismiss(id: string) {
    setDismissedIds((prev) => [...prev, id]);
  }

  return (
    <div className="fixed bottom-6 right-6 z-50" ref={containerRef}>
      {open && visibleNotifications.length > 0 && (
        <div className="absolute bottom-full right-0 mb-3 w-80">
          <NotificationsPanel notifications={visibleNotifications} onDismiss={handleDismiss} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white pl-3 pr-2 py-1.5 shadow-lg transition-all cursor-pointer"
      >
        <span className="text-xs font-semibold">Notification</span>
        <span className="relative flex h-4 w-4 items-center justify-center shrink-0">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-white px-0.5 text-[8px] font-bold text-blue-600">
              {unreadCount}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
