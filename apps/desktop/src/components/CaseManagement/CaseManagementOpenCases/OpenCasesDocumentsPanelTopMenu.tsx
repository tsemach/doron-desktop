import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import KebabMenu from "@/components/ui/KebabMenu";
import { invoke } from "@tauri-apps/api/core";
import { useLanguage } from "../../../context/LanguageContext";
import { getFollowupStatus } from "@/lib/followupStatus";

import { Case } from "../CaseManagementTypes";

interface OpenDocumentsPanelTopMenuProps {
  selectedCase: Case | null;
  activeRightTab: "preview" | "emails";
  onTabChange?: (tab: "preview" | "emails") => void;
  onAddDocument: () => void;
  onEditCaseAnnotations?: () => void;
  isDetailView?: boolean;
}

export default function OpenDocumentsPanelTopMenu({
  selectedCase,
  activeRightTab,
  onTabChange,
  onAddDocument,
  onEditCaseAnnotations,
  isDetailView = false,
}: OpenDocumentsPanelTopMenuProps) {
  const { t } = useLanguage();

  async function handleOpenFolder(folderPath: string) {
    try {
      await invoke("open_path", { path: folderPath });
    } catch (e) {
      console.error("Failed to open folder:", e);
      alert(`Failed to open folder: ${e}`);
    }
  }

  return (
    <>
      <div>
        {selectedCase && !isDetailView ? (
          <Link
            to={`/case-management/cases/${selectedCase.id}`}
            className="text-lg font-bold text-foreground hover:text-primary hover:underline leading-snug block w-fit"
          >
            {selectedCase.subject || t("no_subject")}
          </Link>
        ) : (
          <h3 className="text-lg font-bold text-foreground leading-snug">
            {selectedCase?.subject || t("no_subject")}
          </h3>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("customer")}: {selectedCase?.name}
        </p>
        {selectedCase?.folder && (
          <div className="flex items-center gap-1.5 mt-1.5 select-none">
            <span
              className="text-[10px] text-muted-foreground/75 font-mono truncate max-w-[280px]"
              title={selectedCase.folder}
            >
              {selectedCase.folder}
            </span>
            <button
              onClick={() => handleOpenFolder(selectedCase.folder!)}
              className="text-muted-foreground hover:text-foreground shrink-0 p-0.5 rounded hover:bg-muted/80 transition-colors cursor-pointer"
              title="Open folder in File Explorer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
              </svg>
            </button>
          </div>
        )}
        {/* Render tags with conditional followup badge */}
        {(() => {
          const allTags = selectedCase?.tags || [];
          const visibleTags = allTags.filter((tag) => isDetailView || tag.name.toLowerCase() !== "followup");
          if (visibleTags.length === 0) return null;

          return (
            <div className="flex flex-wrap gap-1.5 mt-2 items-center">
              {visibleTags.map((tag) => {
                const isFollowupTag = tag.name.toLowerCase() === "followup";
                const status = isFollowupTag && isDetailView ? getFollowupStatus(tag.value) : null;

                return (
                  <div key={tag.name} className="flex items-center gap-1.5 select-none">
                    <span
                      className={`px-1 py-px rounded-full text-[9px] font-normal lowercase leading-tight select-none font-sans ${
                        tag.type === "system"
                          ? "bg-muted/50 text-muted-foreground/75"
                          : "bg-primary/5 text-primary/75"
                      }`}
                    >
                      #{!isFollowupTag && tag.value ? `${tag.name}: ${tag.value}` : tag.name}
                    </span>
                    {status && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border select-none font-sans ${
                          status.type === "overdue"
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200/50 animate-pulse"
                            : status.type === "due-today"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200/50"
                            : "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300 border-blue-100/30"
                        }`}
                      >
                        <span>{status.type === "overdue" ? "⚠️" : status.type === "due-today" ? "⏰" : "📅"}</span>
                        {status.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {selectedCase?.notes && (
          <p className="text-[10px] text-muted-foreground/80 mt-2 italic border-l-2 border-border/85 pl-1.5 bg-muted/20 py-0.5 rounded-r max-w-md line-clamp-2">
            "{selectedCase.notes}"
          </p>
        )}
      </div>
      <div className="flex gap-2 shrink-0 items-center">
        <Button
          size="sm"
          onClick={onAddDocument}
          className="text-xs px-3 h-8 gap-1.5"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
          {t("add_document")}
        </Button>

        <KebabMenu
          triggerClassName="h-8 w-8 p-0 flex items-center justify-center border border-border hover:bg-muted text-foreground"
          title={t("more_options")}
          items={[
            {
              label: t("edit_case_notes_tags"),
              hidden: !selectedCase || !onEditCaseAnnotations,
              onClick: () => onEditCaseAnnotations?.(),
              icon: (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-muted-foreground"
                >
                  <path d="M12 2H2v10l9.29 9.29c.39.39 1.02.39 1.41 0l8.59-8.59c.39-.39.39-1.02 0-1.41L12 2z" />
                  <path d="M7 7h.01" />
                </svg>
              ),
            },
            {
              label: t("emails"),
              hidden: !selectedCase || !onTabChange,
              active: activeRightTab === "emails",
              onClick: () => onTabChange?.(activeRightTab === "emails" ? "preview" : "emails"),
              icon: (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={activeRightTab === "emails" ? "text-primary" : "text-muted-foreground"}
                >
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
