import { useLanguage } from "@/context/LanguageContext";
import TagChip from "@/components/ui/TagChip";
import { getFollowupStatus } from "@/lib/followupStatus";
import { findTagValue, filterOverviewTags } from "@/lib/caseTags";
import { Case } from "../CaseManagementTypes";
import CaseOverviewTasksCard from "./CaseOverviewTasksCard";

interface CaseOverviewPanelProps {
  caseId: number;
  selectedCase: Case;
  onViewTasks: () => void;
  onViewEmails: () => void;
}

export default function CaseOverviewPanel({ caseId, selectedCase, onViewTasks, onViewEmails }: CaseOverviewPanelProps) {
  const { t } = useLanguage();
  // Not wired into JSX yet — CaseOverviewEmailsCard (Task 6) will consume this.
  // Referenced here only to satisfy noUnusedParameters until then.
  void onViewEmails;

  const followupStatus = getFollowupStatus(findTagValue(selectedCase.tags, "followup"));
  const overviewTags = filterOverviewTags(selectedCase.tags);

  return (
    <div className="p-4 space-y-3">
      {followupStatus && (
        <div
          className={`rounded-md border px-3 py-2 text-xs font-semibold flex items-center gap-1.5 ${
            followupStatus.type === "overdue"
              ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200/50"
              : followupStatus.type === "due-today"
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200/50"
              : "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300 border-blue-100/30"
          }`}
        >
          <span>{followupStatus.type === "overdue" ? "⚠️" : followupStatus.type === "due-today" ? "⏰" : "📅"}</span>
          {followupStatus.label}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="space-y-3">
          <CaseOverviewTasksCard caseId={caseId} onViewAll={onViewTasks} />
        </div>

        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{t("notes")}</h4>
            {selectedCase.notes ? (
              <p className="text-xs text-muted-foreground italic whitespace-pre-line">{selectedCase.notes}</p>
            ) : (
              <p className="text-xs text-muted-foreground italic">{t("no_notes_for_case")}</p>
            )}
          </div>

          <div className="rounded-md border border-border bg-muted/20 p-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{t("tags")}</h4>
            {overviewTags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {overviewTags.map((tag) => (
                  <TagChip key={tag.id} tag={tag} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">{t("no_tags_for_case")}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
