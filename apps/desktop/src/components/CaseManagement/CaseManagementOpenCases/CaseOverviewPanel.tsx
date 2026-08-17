import { useLanguage } from "@/context/LanguageContext";
import TagChip from "@/components/ui/TagChip";
import { getFollowupStatus } from "@/lib/followupStatus";
import { findTagValue, filterOverviewTags } from "@/lib/caseTags";
import { findCaseTypeOption } from "../caseTypeOptions";
import { Case } from "../CaseManagementTypes";
import CaseOverviewTasksCard from "./CaseOverviewTasksCard";
import CaseOverviewEmailsCard from "./CaseOverviewEmailsCard";

interface CaseOverviewPanelProps {
  caseId: number;
  selectedCase: Case;
  onViewTasks: () => void;
  onViewEmails: () => void;
  onEditNotesAndTags: () => void;
}

export default function CaseOverviewPanel({
  caseId,
  selectedCase,
  onViewTasks,
  onViewEmails,
  onEditNotesAndTags,
}: CaseOverviewPanelProps) {
  const { t } = useLanguage();

  const followupStatus = getFollowupStatus(findTagValue(selectedCase.tags, "followup"));
  const overviewTags = filterOverviewTags(selectedCase.tags);
  const caseTypeOption = findCaseTypeOption(findTagValue(selectedCase.tags, "type"));
  const organization = findTagValue(selectedCase.tags, "organization");

  return (
    <div className="p-4 space-y-3">
      <div className="pb-3 border-b border-border/60 space-y-1.5">
        <h3 className="text-lg font-bold text-foreground leading-snug">
          {selectedCase.subject || t("no_subject")}
        </h3>
        {(caseTypeOption || organization) && (
          <div className="flex items-center gap-2 flex-wrap">
            {caseTypeOption && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                {t(caseTypeOption.labelKey)}
              </span>
            )}
            {organization && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                {organization}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="space-y-3">
          <CaseOverviewTasksCard caseId={caseId} onViewAll={onViewTasks} />
          <CaseOverviewEmailsCard caseId={caseId} onViewAll={onViewEmails} />
        </div>

        <div className="space-y-3">
          {followupStatus && (
            <div
              className={`rounded-md border p-3 ${
                followupStatus.type === "overdue"
                  ? "bg-rose-50 dark:bg-rose-950/20 border-rose-200/60 dark:border-rose-800/60"
                  : followupStatus.type === "due-today"
                  ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-800/60"
                  : "bg-blue-50 dark:bg-blue-950/20 border-blue-200/60 dark:border-blue-800/60"
              }`}
            >
              <h4
                className={`text-xs font-bold uppercase tracking-wider mb-1 ${
                  followupStatus.type === "overdue"
                    ? "text-rose-700 dark:text-rose-300"
                    : followupStatus.type === "due-today"
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-blue-600 dark:text-blue-300"
                }`}
              >
                {t("status_followup")}
              </h4>
              <div
                className={`text-xs font-semibold flex items-center gap-1.5 ${
                  followupStatus.type === "overdue"
                    ? "text-rose-700 dark:text-rose-300"
                    : followupStatus.type === "due-today"
                    ? "text-amber-700 dark:text-amber-300"
                    : "text-blue-600 dark:text-blue-300"
                }`}
              >
                <span>{followupStatus.type === "overdue" ? "⚠️" : followupStatus.type === "due-today" ? "⏰" : "📅"}</span>
                {followupStatus.label}
              </div>
            </div>
          )}

          <div className="rounded-md border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("notes")}</h4>
              <button
                type="button"
                onClick={onEditNotesAndTags}
                className="text-[10px] font-medium text-primary hover:underline cursor-pointer"
              >
                {t("edit")}
              </button>
            </div>
            {selectedCase.notes ? (
              <p className="text-xs text-muted-foreground italic whitespace-pre-line" dir="auto">{selectedCase.notes}</p>
            ) : (
              <p className="text-xs text-muted-foreground italic">{t("no_notes_for_case")}</p>
            )}
          </div>

          <div className="rounded-md border border-border bg-muted/20 p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("tags")}</h4>
              <button
                type="button"
                onClick={onEditNotesAndTags}
                className="text-[10px] font-medium text-primary hover:underline cursor-pointer"
              >
                {t("view_all_cases")} →
              </button>
            </div>
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
