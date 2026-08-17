import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/context/LanguageContext";
import { STATUS_OPTION_COLORS } from "@/lib/task/statusColors";
import { findTagValue } from "@/lib/caseTags";
import { getFollowupStatus, FollowupStatus } from "@/lib/followupStatus";
import type { TaskWithCase } from "@/lib/task/types";
import type { Case, CaseStatus } from "../CaseManagement/CaseManagementTypes";
import type { CaseDetailNavigationState } from "../CaseManagement/CaseDetailLayout";

interface PendingAlert {
  id: number;
  sender: string;
  subject: string;
  received_at: string;
  suggested_case_id: number | null;
}

const CARD_CLASS = "rounded-md border border-border bg-muted/20 p-3";
const CARD_HEADER_CLASS = "text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2";
const ROW_CLASS =
  "flex items-center gap-2 text-xs py-1 border-b border-border/50 last:border-b-0 hover:bg-muted/40 -mx-1 px-1 rounded transition-colors cursor-pointer text-left w-full";

function followupBadgeClass(type: FollowupStatus["type"]): string {
  if (type === "overdue") return "text-rose-700 dark:text-rose-300";
  if (type === "due-today") return "text-amber-700 dark:text-amber-300";
  return "text-blue-600 dark:text-blue-300";
}

export function AppHomeOverview() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskWithCase[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [alerts, setAlerts] = useState<PendingAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      invoke<TaskWithCase[]>("list_all_tasks"),
      invoke<any[]>("list_cases"),
      invoke<PendingAlert[]>("list_pending_email_alerts"),
    ])
      .then(([taskRes, caseRes, alertRes]) => {
        if (!active) return;
        setTasks(taskRes);
        setCases(
          caseRes.map((c) => ({
            id: String(c.id),
            subject: c.subject,
            status: c.status as CaseStatus,
            name: c.name,
            createdAt: c.created_at ? c.created_at.split("T")[0] : "—",
            tags: c.tags || [],
          }))
        );
        setAlerts(alertRes);
      })
      .catch((err) => console.error("Failed to load home overview:", err))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function goToCase(caseId: string | number, state?: CaseDetailNavigationState) {
    navigate(`/case-management/cases/${caseId}`, state ? { state } : undefined);
  }

  const openCaseIds = new Set(cases.filter((c) => c.status !== "closed").map((c) => c.id));
  const openTasks = tasks.filter(
    (task) => (task.status === "Waiting" || task.status === "In progress") && openCaseIds.has(String(task.case_id))
  );

  const openTasksByCase = new Map<number, { caseLabel: string; tasks: TaskWithCase[] }>();
  openTasks.forEach((task) => {
    const group = openTasksByCase.get(task.case_id);
    if (group) {
      group.tasks.push(task);
    } else {
      openTasksByCase.set(task.case_id, { caseLabel: task.case_subject || task.case_name, tasks: [task] });
    }
  });

  const followups = cases
    .filter((c) => c.status !== "closed")
    .map((c) => ({ case: c, status: getFollowupStatus(findTagValue(c.tags, "followup")) }))
    .filter((f): f is { case: Case; status: FollowupStatus } => f.status !== null)
    .sort((a, b) => {
      const rank = { overdue: 0, "due-today": 1, pending: 2 };
      return rank[a.status.type] - rank[b.status.type];
    });

  const casesById = new Map(cases.map((c) => [c.id, c]));

  return (
    <div className="w-full max-w-sm">
      <h3 className="text-sm font-bold text-foreground mb-3">{t("home_overview_title")}</h3>

      {loading ? (
        <p className="text-xs text-muted-foreground">{t("loading")}</p>
      ) : (
        <div className="flex flex-col gap-3 pl-6">
          <div className={CARD_CLASS}>
            <h4 className={CARD_HEADER_CLASS}>
              {t("home_open_tasks")} ({openTasks.length})
            </h4>
            {openTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">{t("home_no_open_tasks")}</p>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-2 p-1">
                {Array.from(openTasksByCase.entries()).map(([caseId, group]) => (
                  <div key={caseId} className="rounded border border-border/60 bg-background/40 p-2">
                    <button
                      type="button"
                      onClick={() => goToCase(caseId)}
                      className="text-[11px] font-semibold text-foreground truncate hover:underline text-left w-full mb-1 cursor-pointer"
                      dir="auto"
                      title={group.caseLabel}
                    >
                      {group.caseLabel}
                    </button>
                    <div className="pl-3 space-y-1">
                      {group.tasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => goToCase(task.case_id, { initialTab: "tasks" })}
                          className={ROW_CLASS}
                        >
                          <span
                            className="size-2 rounded-full shrink-0"
                            style={{
                              backgroundColor: STATUS_OPTION_COLORS[task.status].color,
                              boxShadow: `0 0 0 2px ${STATUS_OPTION_COLORS[task.status].backgroundColor}`,
                            }}
                          />
                          <span className="flex-1 min-w-0 truncate text-foreground" dir="auto" title={task.title}>
                            {task.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={CARD_CLASS}>
            <h4 className={CARD_HEADER_CLASS}>
              {t("home_followups")} ({followups.length})
            </h4>
            {followups.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">{t("home_no_followups")}</p>
            ) : (
              <div className="space-y-1">
                {followups.map(({ case: c, status }) => (
                  <button key={c.id} type="button" onClick={() => goToCase(c.id)} className={ROW_CLASS}>
                    <span className="flex-1 min-w-0 truncate font-medium text-foreground" dir="auto" title={c.subject || c.name}>
                      {c.subject || c.name}
                    </span>
                    <span className={`text-[10px] font-semibold flex items-center gap-1 shrink-0 ${followupBadgeClass(status.type)}`}>
                      <span>{status.type === "overdue" ? "⚠️" : status.type === "due-today" ? "⏰" : "📅"}</span>
                      {status.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={CARD_CLASS}>
            <h4 className={CARD_HEADER_CLASS}>
              {t("home_needs_assignment")} ({alerts.length})
            </h4>
            {alerts.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">{t("home_no_pending_emails")}</p>
            ) : (
              <div className="space-y-1.5">
                {alerts.map((alert) => {
                  const suggestedCase = alert.suggested_case_id != null ? casesById.get(String(alert.suggested_case_id)) : undefined;
                  return (
                    <button
                      key={alert.id}
                      type="button"
                      onClick={() => suggestedCase && goToCase(suggestedCase.id)}
                      disabled={!suggestedCase}
                      className={`flex items-center gap-2 py-1.5 border-b border-border/50 last:border-b-0 -mx-1 px-1 rounded transition-colors text-left w-full ${
                        suggestedCase ? "hover:bg-muted/40 cursor-pointer" : "cursor-default"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-foreground truncate" dir="auto" title={alert.subject}>
                          {alert.subject}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate" dir="auto">
                          {alert.sender}
                        </div>
                      </div>
                      {suggestedCase && (
                        <span className="text-[10px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5 shrink-0 max-w-32 truncate">
                          → {suggestedCase.subject || suggestedCase.name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
