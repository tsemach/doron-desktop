import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface NotificationSettingsRow {
  category: string;
  in_app_enabled: boolean;
  os_toast_enabled: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  email_arrived: "Email arrived",
  task_due: "Task due",
  ai_credit_low: "AI credit low",
};

export default function SettingNotifications() {
  const [rows, setRows] = useState<NotificationSettingsRow[]>([]);

  useEffect(() => {
    invoke<NotificationSettingsRow[]>("get_notification_settings")
      .then(setRows)
      .catch((err) => console.error("[SettingNotifications] Failed to load settings:", err));
  }, []);

  async function toggle(category: string, field: "in_app_enabled" | "os_toast_enabled") {
    const row = rows.find((r) => r.category === category);
    if (!row) return;
    const updated = { ...row, [field]: !row[field] };
    setRows(rows.map((r) => (r.category === category ? updated : r)));
    await invoke("update_notification_settings", {
      category,
      inAppEnabled: updated.in_app_enabled,
      osToastEnabled: updated.os_toast_enabled,
    });
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.category} className="flex items-center justify-between border border-border rounded-lg p-3">
            <span className="text-sm text-foreground">{CATEGORY_LABELS[row.category] ?? row.category}</span>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={row.in_app_enabled} onChange={() => toggle(row.category, "in_app_enabled")} />
                In-app
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={row.os_toast_enabled} onChange={() => toggle(row.category, "os_toast_enabled")} />
                OS toast
              </label>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No notification categories yet — settings appear here the first time each type of notification has fired at least once.
          </p>
        )}
      </div>
    </div>
  );
}
