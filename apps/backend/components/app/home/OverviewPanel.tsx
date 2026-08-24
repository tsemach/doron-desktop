import { computeUrgency, type FollowUpTask, type OpenTaskGroup } from "../../../lib/tasks/crud";
import type { PendingEmailAlertRow } from "../../../lib/email/crud";
import { CARD_CLASS, CARD_HEADER_CLASS } from "./panelStyles";

const STATUS_DOT_CLASSES: Record<string, string> = {
  Waiting: "bg-zinc-400",
  "In progress": "bg-blue-500",
  Done: "bg-emerald-500",
  Cancel: "bg-rose-500",
};

type OverviewPanelProps = {
  openTaskGroups: OpenTaskGroup[];
  followUps: FollowUpTask[];
  pendingEmailAlerts: PendingEmailAlertRow[];
};

// Matches desktop's AppHomeOverview.tsx structure/classes: three stacked
// CARD_CLASS panels in a max-w-sm right column.
export default function OverviewPanel({ openTaskGroups, followUps, pendingEmailAlerts }: OverviewPanelProps) {
  const openTaskCount = openTaskGroups.reduce((sum, g) => sum + g.tasks.length, 0);

  return (
    <div className="w-full max-w-sm">
      <h2 className="text-lg font-bold text-foreground mb-4">Overview</h2>
      <div className="flex flex-col gap-3">
        <div className={CARD_CLASS}>
          <p className={CARD_HEADER_CLASS}>Open Tasks ({openTaskCount})</p>
          <div className="flex-1 overflow-y-auto flex flex-col gap-2">
            {openTaskGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open tasks.</p>
            ) : (
              openTaskGroups.map((group) => (
                <div key={group.caseId}>
                  <p className="text-xs font-semibold text-foreground truncate">{group.caseName}</p>
                  {group.tasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-1.5 pl-1 py-0.5">
                      <span className={`size-1.5 rounded-full shrink-0 ${STATUS_DOT_CLASSES[task.status] ?? "bg-zinc-400"}`} />
                      <span className="text-xs text-muted-foreground truncate">{task.title}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        <div className={CARD_CLASS}>
          <p className={CARD_HEADER_CLASS}>Follow-ups ({followUps.length})</p>
          <div className="flex-1 overflow-y-auto flex flex-col gap-1.5">
            {followUps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No follow-ups.</p>
            ) : (
              followUps.map((task) => {
                const urgency = task.dueDate ? computeUrgency(task.dueDate, new Date()) : "upcoming";
                return (
                  <div key={task.id} className="flex items-center justify-between text-xs">
                    <span className="truncate text-foreground">{task.title}</span>
                    {urgency === "overdue" ? (
                      <span className="shrink-0 text-rose-600 font-medium">
                        ⚠ Overdue: {task.dueDate && new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="shrink-0 text-muted-foreground">{task.dueDate && new Date(task.dueDate).toLocaleDateString()}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className={CARD_CLASS}>
          <p className={CARD_HEADER_CLASS}>Needs Case Assignment ({pendingEmailAlerts.length})</p>
          <div className="flex-1 overflow-y-auto">
            {pendingEmailAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No emails waiting to be handled.</p>
            ) : (
              pendingEmailAlerts.map((alert) => (
                <div key={alert.id} className="text-xs text-foreground py-0.5 truncate">
                  {alert.subject}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
