import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { listen } from "@tauri-apps/api/event";
import { Bell } from "lucide-react";
import { unreadCountAtom, loadNotifications, upsertNotification, type Notification } from "@/store/notificationStore";
import NotificationPanel from "./NotificationPanel";

export default function NotificationBell() {
  const unreadCount = useAtomValue(unreadCountAtom);
  const [isOpen, setIsOpen] = useState(false);

  function refresh() {
    loadNotifications().catch((err) => console.error("[NotificationBell] Failed to load notifications:", err));
  }

  useEffect(() => {
    refresh();
    const unlisten = listen<Notification>("notification-created", (event) => {
      upsertNotification(event.payload);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {!isOpen && (
        <button
          type="button"
          onClick={() => {
            // Re-fetch on open so a snooze that elapsed during this session
            // resurfaces without needing an app restart.
            refresh();
            setIsOpen(true);
          }}
          className="relative bg-primary hover:bg-primary/90 text-primary-foreground rounded-full p-4 shadow-xl transition-all hover:scale-105 duration-200 cursor-pointer"
          aria-label="Notifications"
        >
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
      )}
      {isOpen && <NotificationPanel onClose={() => setIsOpen(false)} />}
    </div>
  );
}
