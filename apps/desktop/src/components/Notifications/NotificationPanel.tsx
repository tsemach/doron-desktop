import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import {
  notificationsAtom,
  parseClickTarget,
  updateNotificationStatus,
  snoozeNotification,
  type Notification,
} from "@/store/notificationStore";
import DateTimePicker from "@/components/ui/DateTimePicker";

interface NotificationPanelProps {
  onClose: () => void;
}

const SNOOZE_PRESETS: { label: string; getUntil: () => Date }[] = [
  { label: "1 hour", getUntil: () => new Date(Date.now() + 60 * 60 * 1000) },
  {
    label: "Tomorrow morning",
    getUntil: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    label: "Next week",
    getUntil: () => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d;
    },
  },
];

function SnoozeMenu({ onPick }: { onPick: (until: Date) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer">
        Snooze
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full mb-1 left-0 w-40 rounded-lg border border-border bg-card shadow-lg py-1 z-40">
            {SNOOZE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPick(preset.getUntil());
                }}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
            <div className="px-3 py-1.5">
              <DateTimePicker
                value={null}
                minDate={new Date()}
                placeholder="Custom…"
                onChange={(until) => {
                  setOpen(false);
                  onPick(until);
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function NotificationPanel({ onClose }: NotificationPanelProps) {
  const notifications = useAtomValue(notificationsAtom);
  const navigate = useNavigate();
  const [statusView, setStatusView] = useState<"active" | "closed">("active");
  const [closedNotifications, setClosedNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (statusView !== "closed") return;
    invoke<Notification[]>("list_notifications", { statusFilter: "closed" })
      .then(setClosedNotifications)
      .catch((err) => console.error("[NotificationPanel] Failed to load closed notifications:", err));
  }, [statusView]);

  const visible = statusView === "active" ? notifications : closedNotifications;

  function handleClickBody(n: Notification) {
    updateNotificationStatus(n.id, "read").catch((err) => console.error(err));
    const target = parseClickTarget(n.click_target);
    if (target?.route) navigate(target.route);
    if (target?.windowEvent) {
      const windowEvent = target.windowEvent;
      // After a navigate() the target route's listeners haven't mounted yet, so
      // a synchronous dispatch would be lost -- defer it, as
      // AppHomeRecentCases.tsx does for its own navigate-then-dispatch.
      if (target.route) {
        setTimeout(() => window.dispatchEvent(new CustomEvent(windowEvent)), 100);
      } else {
        window.dispatchEvent(new CustomEvent(windowEvent));
      }
    }
    onClose();
  }

  return (
    <div className="bg-card border border-border rounded-2xl w-96 shadow-2xl max-h-[500px] flex flex-col overflow-hidden">
      <div className="px-4 py-3 bg-muted border-b border-border flex items-center justify-between shrink-0">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStatusView("active")}
            className={`text-xs font-semibold px-2 py-1 rounded cursor-pointer ${statusView === "active" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setStatusView("closed")}
            className={`text-xs font-semibold px-2 py-1 rounded cursor-pointer ${statusView === "closed" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Closed
          </button>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground cursor-pointer">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {visible.length === 0 && <div className="p-4 text-sm text-muted-foreground text-center">No notifications</div>}
        {visible.map((n) => (
          <div key={n.id} className="p-3 flex flex-col gap-1.5">
            <button type="button" onClick={() => handleClickBody(n)} className="text-left cursor-pointer">
              <div className="text-sm font-semibold text-foreground">{n.title}</div>
              <div className="text-xs text-muted-foreground">{n.body}</div>
            </button>
            {statusView === "active" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateNotificationStatus(n.id, "closed")}
                  className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => updateNotificationStatus(n.id, "deleted")}
                  className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Delete
                </button>
                <SnoozeMenu onPick={(until) => snoozeNotification(n.id, until.toISOString())} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
