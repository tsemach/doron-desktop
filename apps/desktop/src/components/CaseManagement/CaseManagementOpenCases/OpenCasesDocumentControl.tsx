import KebabMenu from "@/components/ui/KebabMenu";
import { useLanguage } from "../../../context/LanguageContext";

import { CaseFile } from "../CaseManagementTypes";

interface OpenCasesDocumentPanelControlProps {
  doc: CaseFile;
  onEditAnnotations: (doc: CaseFile) => void;
  onRemoveDocument: (doc: CaseFile) => void;
}

export default function OpenCasesDocumentControl({
  doc,
  onEditAnnotations,
  onRemoveDocument,
}: OpenCasesDocumentPanelControlProps) {
  const { t } = useLanguage();

  return (
    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
      <KebabMenu
        title={t("more_options")}
        items={[
          {
            label: t("edit_notes_tags"),
            onClick: () => onEditAnnotations(doc),
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
            label: t("remove_document"),
            variant: "destructive",
            onClick: () => onRemoveDocument(doc),
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
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                <line x1="10" x2="10" y1="11" y2="17" />
                <line x1="14" x2="14" y1="11" y2="17" />
              </svg>
            ),
          },
        ]}
      />
    </div>
  );
}
