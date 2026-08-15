"use client";

import { useState } from "react";
import { Bell, Briefcase, ChevronDown, ChevronRight, FileText, Mail, X, type LucideIcon } from "lucide-react";
import type { NotificationItem } from "../../../lib/dashboard/types";
import { formatDashboardTimestamp } from "../../../lib/dashboard/formatDate";
import { useLanguage } from "../../../context/LanguageContext";

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

// Same collapse-with-fade pattern as CaseGroup's "Follow up" group: show 3
// by default with a bottom fade when there are more, expand/collapse on
// click with the chevron flipping between ChevronRight and ChevronDown.
const COLLAPSED_VISIBLE_COUNT = 3;
const COLLAPSED_MAX_HEIGHT = "280px";

export default function NotificationsPanel({ notifications, onDismiss }: NotificationsPanelProps) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const hasOverflow = notifications.length > COLLAPSED_VISIBLE_COUNT;

  return (
    <div className="rounded-xl bg-card overflow-hidden shadow-xs">
      <button
        type="button"
        onClick={() => hasOverflow && setExpanded((prev) => !prev)}
        disabled={!hasOverflow}
        className="w-full flex items-center gap-2 px-4 py-3 border-b border-border text-left disabled:cursor-default"
      >
        {hasOverflow ? (
          expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <h2 className="text-sm font-semibold text-foreground">{t("notifications_title")}</h2>
      </button>
      <div className="relative">
        <ul
          className="flex flex-col gap-2 p-3 overflow-hidden transition-[max-height] duration-300 ease-in-out"
          style={{ maxHeight: !hasOverflow || expanded ? "2000px" : COLLAPSED_MAX_HEIGHT }}
        >
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
                  aria-label={t("notifications_dismiss")}
                  className="absolute top-2 right-2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
        {hasOverflow && (
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent transition-opacity duration-300 ${
              expanded ? "opacity-0" : "opacity-100"
            }`}
          />
        )}
      </div>
    </div>
  );
}
