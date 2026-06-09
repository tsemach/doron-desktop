import { useState } from "react";
import { Button } from "@/components/ui/button";
import { openPath } from "@tauri-apps/plugin-opener";
import { useLanguage } from "../../../context/LanguageContext";

import { Case } from "../CaseManagementTypes";

interface OpenDocumentsPanelTopMenuProps {
  selectedCase: Case | null;
  activeRightTab: "preview" | "emails";
  onTabChange?: (tab: "preview" | "emails") => void;
  onShowFields: () => void;
  onAddDocument: () => void;
  onEditCaseAnnotations?: () => void;
}

export default function OpenDocumentsPanelTopMenu({
  selectedCase,
  activeRightTab,
  onTabChange,
  onShowFields,
  onAddDocument,
  onEditCaseAnnotations,
}: OpenDocumentsPanelTopMenuProps) {
  const { t } = useLanguage();
  const [showMenu, setShowMenu] = useState(false);

  async function handleOpenFolder(folderPath: string) {
    try {
      await openPath(folderPath);
    } catch (e) {
      console.error("Failed to open folder:", e);
      alert(`Failed to open folder: ${e}`);
    }
  }

  return (
    <>
      <div>
        <h3 className="text-lg font-bold text-foreground leading-snug">
          {selectedCase?.subject || t("no_subject")}
        </h3>
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
        {selectedCase?.tags && selectedCase.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {selectedCase.tags.map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-semibold border border-primary/20 tracking-wide uppercase select-none font-sans"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {selectedCase?.notes && (
          <p className="text-[10px] text-muted-foreground/80 mt-2 italic border-l-2 border-border/85 pl-1.5 bg-muted/20 py-0.5 rounded-r max-w-md line-clamp-2">
            "{selectedCase.notes}"
          </p>
        )}
      </div>
      <div className="flex gap-2 shrink-0 items-center">
        {selectedCase && onEditCaseAnnotations && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onEditCaseAnnotations}
            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-primary/5"
            title={t("edit_case_notes_tags")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2H2v10l9.29 9.29c.39.39 1.02.39 1.41 0l8.59-8.59c.39-.39.39-1.02 0-1.41L12 2z" />
              <path d="M7 7h.01" />
            </svg>
          </Button>
        )}
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

        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMenu(!showMenu)}
            className="h-8 w-8 p-0 flex items-center justify-center border-border hover:bg-muted"
            title="More Options"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="1.2" fill="currentColor" />
              <circle cx="12" cy="5" r="1.2" fill="currentColor" />
              <circle cx="12" cy="19" r="1.2" fill="currentColor" />
            </svg>
          </Button>

          {showMenu && (
            <>
              {/* Invisible overlay to close dropdown on click outside */}
              <div
                className="fixed inset-0 z-30"
                onClick={() => setShowMenu(false)}
              />

              <div className="absolute right-0 mt-1.5 w-48 rounded-lg border border-border bg-card shadow-lg py-1 z-40 animate-in fade-in slide-in-from-top-1 duration-100">
                {selectedCase && onTabChange && (
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      onTabChange(activeRightTab === "emails" ? "preview" : "emails");
                    }}
                    className={`w-full px-3 py-2 text-left text-xs font-semibold hover:bg-muted transition-colors flex items-center gap-2 cursor-pointer bg-transparent border-none ${
                      activeRightTab === "emails" ? "text-primary bg-primary/5" : "text-foreground"
                    }`}
                  >
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
                    {t("emails")}
                  </button>
                )}

                <button
                  onClick={() => {
                    setShowMenu(false);
                    onShowFields();
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-semibold text-foreground hover:bg-muted transition-colors flex items-center gap-2 cursor-pointer bg-transparent border-none"
                >
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
                    <rect width="18" height="18" x="3" y="3" rx="2" />
                    <path d="M7 8h10" />
                    <path d="M7 12h10" />
                    <path d="M7 16h10" />
                  </svg>
                  {t("case_fields")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
