import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useLanguage } from "../../../context/LanguageContext";

interface PendingAlert {
  id: number;
  message_id: string;
  sender: string;
  subject: string;
  body_snippet: string;
  received_at: string;
  suggested_case_id: number | null;
  confidence: number;
  reason: string;
  attachments_json: string;
}

import { Case } from "../CaseManagementTypes";

interface Attachment {
  name: string;
  size_kb: number;
}

export default function CaseManagementEmailAlertReview() {
  const { t } = useLanguage();
  const [alerts, setAlerts] = useState<PendingAlert[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCaseMap, setSelectedCaseMap] = useState<HashMap<number, number>>({});

  type HashMap<K extends keyof any, V> = { [P in K]: V };

  useEffect(() => {
    loadAlerts();
    loadCases();

    // Listen for backend real-time email alerts
    const unlisten = listen("new-email-alert", () => {
      loadAlerts();
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  async function loadAlerts() {
    try {
      const res = await invoke<PendingAlert[]>("list_pending_email_alerts");
      setAlerts(res);

      // Pre-populate dropdown map with AI suggested cases
      const map: HashMap<number, number> = {};
      for (const alert of res) {
        if (alert.suggested_case_id) {
          map[alert.id] = alert.suggested_case_id;
        }
      }
      setSelectedCaseMap(map);
    } catch (e) {
      console.error("Failed to load email alerts:", e);
    }
  }

  async function loadCases() {
    try {
      const res = await invoke<any[]>("list_cases");
      setCases(res.map(c => ({
        id: String(c.id),
        name: c.name,
        subject: c.subject,
        status: c.status,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        folder: c.folder,
        notes: c.notes,
        tags: c.tags || [],
      })));
    } catch (e) {
      console.error("Failed to load cases list:", e);
    }
  }

  async function handleConfirm(alertId: number) {
    const targetCaseId = selectedCaseMap[alertId];
    if (!targetCaseId) {
      alert("Please select a case to link this email to.");
      return;
    }

    try {
      await invoke("confirm_email_alert", { alertId, caseId: Number(targetCaseId) });
      // Reload alerts
      loadAlerts();
    } catch (e) {
      console.error(e);
      alert("Error confirming email match: " + e);
    }
  }

  async function handleDelete(alertId: number) {
    if (!confirm("Are you sure you want to dismiss this email? Attachments will be deleted.")) return;

    try {
      await invoke("delete_email_alert", { alertId });
      loadAlerts();
    } catch (e) {
      console.error(e);
      alert("Error deleting email: " + e);
    }
  }

  if (alerts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Floating Notification Trigger */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-xl flex items-center gap-2 cursor-pointer transition-all hover:scale-105 duration-200 animate-bounce"
        >
          <span className="text-lg">✉</span>
          <span className="text-xs font-bold bg-white text-blue-600 rounded-full px-2 py-0.5">
            {alerts.length}
          </span>
          <span className="text-xs font-semibold">{t("incoming_emails") || "Incoming Emails"}</span>
        </button>
      )}

      {/* Slide-out Review Center Panel */}
      {isOpen && (
        <div className="bg-white dark:bg-zinc-900 border border-border rounded-2xl w-96 shadow-2xl max-h-[500px] flex flex-col overflow-hidden animate-fade-in">
          <div className="px-4 py-3 bg-muted border-b border-border flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-foreground">{t("email_matching_center") || "AI Matching Center"}</span>
              <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {alerts.length} {t("new") || "new"}
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-muted-foreground hover:text-foreground text-sm cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {alerts.map((alert) => {
              const attachments: Attachment[] = JSON.parse(alert.attachments_json || "[]");
              return (
                <div key={alert.id} className="border border-border/80 rounded-xl p-3.5 bg-background space-y-3 shadow-xs">
                  {/* Sender & Date */}
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-xs font-bold text-foreground truncate max-w-[150px]" title={alert.sender}>
                      {alert.sender}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                      {new Date(alert.received_at).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Subject & snippet */}
                  <div className="space-y-1">
                    <h5 className="text-xs font-semibold text-foreground leading-snug">{alert.subject}</h5>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{alert.body_snippet}</p>
                  </div>

                  {/* Staged attachments */}
                  {attachments.length > 0 && (
                    <div className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1.5 flex-wrap">
                      <span>📎 {t("attachments") || "Attachments"}:</span>
                      {attachments.map((att, idx) => (
                        <span key={idx} className="bg-muted px-1.5 py-0.5 rounded border border-border/40 max-w-[120px] truncate" title={att.name}>
                          {att.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* AI Suggesstion Alert */}
                  {alert.suggested_case_id ? (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 text-[11px] p-2.5 rounded-lg text-emerald-800 dark:text-emerald-300">
                      <strong>💡 AI Suggestion ({Math.round(alert.confidence * 100)}%):</strong>
                      <p className="mt-0.5 font-normal leading-normal">{alert.reason}</p>
                    </div>
                  ) : (
                    <div className="bg-amber-500/10 border border-amber-500/20 text-[11px] p-2.5 rounded-lg text-amber-800 dark:text-amber-300">
                      <strong>⚠️ Unmatched:</strong>
                      <p className="mt-0.5 font-normal leading-normal">AI could not find a matching case. Please link manually below.</p>
                    </div>
                  )}

                  {/* Selection and actions */}
                  <div className="space-y-2">
                    <select
                      value={selectedCaseMap[alert.id] || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedCaseMap(prev => ({
                          ...prev,
                          [alert.id]: Number(val),
                        }));
                      }}
                      className="w-full border border-input rounded-lg px-2.5 py-1.5 text-xs bg-background focus:ring-1 focus:ring-blue-500 cursor-pointer appearance-none"
                    >
                      <option value="">-- {t("select_case") || "Select Case to Link"} --</option>
                      {cases.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>

                    <div className="flex gap-2 w-full">
                      <button
                        onClick={() => handleConfirm(alert.id)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-1.5 rounded-lg cursor-pointer transition-colors shadow-xs"
                      >
                        ✓ {t("link_and_file") || "Link & File"}
                      </button>
                      <button
                        onClick={() => handleDelete(alert.id)}
                        className="bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20 border border-border/80 text-muted-foreground hover:text-foreground text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
