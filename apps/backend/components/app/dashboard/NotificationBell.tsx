"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import type { NotificationItem } from "../../../lib/dashboard/types";
import NotificationsPanel from "@/components/app/dashboard/NotificationsPanel";
import { useLanguage } from "../../../context/LanguageContext";

type NotificationBellProps = {
  notifications: NotificationItem[];
};

export default function NotificationBell({ notifications }: NotificationBellProps) {
  const { t } = useLanguage();
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
    <div className="fixed bottom-6 right-6 rtl:right-auto rtl:left-6 z-50" ref={containerRef}>
      {visibleNotifications.length > 0 && (
        <div
          className={`absolute bottom-full right-0 rtl:right-auto rtl:left-0 mb-3 w-80 transition-all duration-200 ease-out ${
            open ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-2 pointer-events-none"
          }`}
        >
          <NotificationsPanel notifications={visibleNotifications} onDismiss={handleDismiss} />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`${t("notifications_title")}${unreadCount > 0 ? t("notifications_unread_suffix").replace("{count}", String(unreadCount)) : ""}`}
        aria-expanded={open}
        className="flex items-center gap-4 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 pl-8 pr-7 py-2 shadow-lg transition-all cursor-pointer"
      >
        <span className="text-base font-semibold">{t("notification_button_label")}</span>
        <span className="relative flex h-6 w-6 items-center justify-center shrink-0">
          <Bell className="h-6 w-6" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
