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

  const unreadCount = notifications.length;

  return (
    <div className="fixed bottom-6 right-6 z-50" ref={containerRef}>
      {open && (
        <div className="absolute bottom-full right-0 mb-3 w-80">
          <NotificationsPanel notifications={notifications} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white pl-3.5 pr-4 py-2.5 shadow-lg transition-all cursor-pointer"
      >
        <Bell className="h-5 w-5" />
        <span className="text-sm font-semibold">Notification</span>
        {unreadCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-blue-600">
            {unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
