import { Button } from "@/components/ui/button";
import { openPath } from "@tauri-apps/plugin-opener";
import { useLanguage } from "../../../context/LanguageContext";
import OpenCasesDocumentsPanelCaseFields from "./OpenCasesDocumentsPanelCaseFields";

type CaseStatus = "open" | "in-progress" | "closed";

interface Case {
  id: string;
  subject?: string;
  status: CaseStatus;
  name: string;
  createdAt: string;
  updatedAt?: string;
  folder?: string;
}

interface OpenDocumentsPanelTopMenuProps {
  selectedCase: Case | null;
  activeRightTab: "preview" | "emails";
  onTabChange?: (tab: "preview" | "emails") => void;
  onShowFields: () => void;
  onAddDocument: () => void;
}

export default function OpenDocumentsPanelTopMenu({
  selectedCase,
  activeRightTab,
  onTabChange,
  onShowFields,
  onAddDocument,
}: OpenDocumentsPanelTopMenuProps) {
  const { t } = useLanguage();

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
      </div>
      <div className="flex gap-2 shrink-0">
        <OpenCasesDocumentsPanelCaseFields onShowFields={onShowFields} />
        {selectedCase && onTabChange && (
          <Button
            variant={activeRightTab === "emails" ? "default" : "outline"}
            size="sm"
            onClick={() => onTabChange(activeRightTab === "emails" ? "preview" : "emails")}
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
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            {t("emails")}
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
      </div>
    </>
  );
}
