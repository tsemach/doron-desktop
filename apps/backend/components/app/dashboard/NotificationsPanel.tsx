import { Bell, Briefcase, FileText, Mail, X, type LucideIcon } from "lucide-react";
import type { NotificationItem } from "../../../lib/dashboard/types";
import { formatDashboardTimestamp } from "../../../lib/dashboard/formatDate";

const TYPE_ICONS: Record<NotificationItem["type"], LucideIcon> = {
  email: Mail,
  document: FileText,
  case: Briefcase,
  system: Bell,
};

const TYPE_ICON_STYLES: Record<NotificationItem["type"], string> = {
  email: "bg-blue-100 text-blue-600",
  document: "bg-purple-100 text-purple-600",
  case: "bg-emerald-100 text-emerald-700",
  system: "bg-amber-100 text-amber-700",
};

const TYPE_CARD_STYLES: Record<NotificationItem["type"], string> = {
  email: "bg-blue-50",
  document: "bg-purple-50",
  case: "bg-emerald-50",
  system: "bg-amber-50",
};

type NotificationsPanelProps = {
  notifications: NotificationItem[];
  onDismiss: (id: string) => void;
};

export default function NotificationsPanel({ notifications, onDismiss }: NotificationsPanelProps) {
  return (
    <div className="rounded-xl bg-card overflow-hidden shadow-xs">
      <div className="px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
      </div>
      <ul className="flex flex-col gap-2 p-3">
        {notifications.map((n) => {
          const Icon = TYPE_ICONS[n.type];
          return (
            <li
              key={n.id}
              className={`relative flex items-start gap-3 rounded-xl p-3 pr-8 ${TYPE_CARD_STYLES[n.type]}`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${TYPE_ICON_STYLES[n.type]}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-foreground">{n.message}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDashboardTimestamp(n.timestamp)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(n.id)}
                aria-label="Dismiss notification"
                className="absolute top-2 right-2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
