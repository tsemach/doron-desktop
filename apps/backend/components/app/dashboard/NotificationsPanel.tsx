import { Bell, Briefcase, FileText, Mail, type LucideIcon } from "lucide-react";
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

type NotificationsPanelProps = {
  notifications: NotificationItem[];
};

export default function NotificationsPanel({ notifications }: NotificationsPanelProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
      </div>
      {notifications.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications</p>
      ) : (
        <ul className="divide-y divide-border">
          {notifications.map((n) => {
            const Icon = TYPE_ICONS[n.type];
            return (
              <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${TYPE_ICON_STYLES[n.type]}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{n.message}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDashboardTimestamp(n.timestamp)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
