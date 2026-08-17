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
      <div className="pb-3 border-b border-border/60 flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-lg font-bold text-foreground leading-snug">
          {selectedCase.subject || t("no_subject")}
        </h3>
        {(caseTypeOption || organization) && (
          <div className="flex items-center gap-2 flex-wrap">
            {caseTypeOption && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                title={t("case_type_label")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
                  <circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
                </svg>
                {t(caseTypeOption.labelKey)}
              </span>
            )}
            {organization && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
                title={t("organization_label")}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <rect x="4" y="2" width="16" height="20" rx="1" />
                  <path d="M9 22v-4h6v4" />
                  <path d="M9 8h1M14 8h1M9 12h1M14 12h1" />
                </svg>
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

          <div
            onClick={onEditNotesAndTags}
            className="rounded-md border border-border bg-muted/20 p-3 cursor-pointer hover:bg-muted/40 transition-colors"
          >
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

          <div
            onClick={onEditNotesAndTags}
            className="rounded-md border border-border bg-muted/20 p-3 cursor-pointer hover:bg-muted/40 transition-colors"
          >
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
