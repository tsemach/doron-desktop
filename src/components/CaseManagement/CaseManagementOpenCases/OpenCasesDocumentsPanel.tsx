import { useState } from "react";
import { useLanguage } from "../../../context/LanguageContext";
import CaseManagementSearch from "../CaseManagementSearch";
import OpenCasesDocumentsPanelList from "./OpenCasesDocumentsPanelList";
import OpenDocumentsPanelTopMenu from "./OpenCasesDocumentsPanelTopMenu";

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

interface CaseFile {
  name: string;
  path: string;
  ext: string;
  size_kb: number;
  title?: string;
  notes?: string;
  tags: string[];
}

interface OpenCasesDocumentsPanelProps {
  selectedCase: Case | null;
  documents: CaseFile[];
  docsLoading: boolean;
  docsError: string | null;
  isLgScreen: boolean;
  leftPercent: number;
  onOpenFile: (filePath: string) => void;
  onRemoveDocument: (doc: CaseFile) => void;
  onEditAnnotations: (doc: CaseFile) => void;
  onShowFields: () => void;
  onAddDocument: () => void;
  onSelectDocument?: (doc: CaseFile) => void;
  selectedDocument?: CaseFile | null;
  activeRightTab?: "preview" | "emails";
  onTabChange?: (tab: "preview" | "emails") => void;
  attachments?: { name: string; staged_path: string; size_kb: number }[];
}

export default function OpenCasesDocumentsPanel({
  selectedCase,
  documents,
  docsLoading,
  docsError,
  isLgScreen,
  leftPercent,
  onOpenFile,
  onRemoveDocument,
  onEditAnnotations,
  onShowFields,
  onAddDocument,
  onSelectDocument,
  selectedDocument,
  activeRightTab = "preview",
  onTabChange,
  attachments = [],
}: OpenCasesDocumentsPanelProps) {
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const { t } = useLanguage();

  const filteredDocs = documents.filter((doc) => {
    if (!docSearchQuery.trim()) return true;
    const q = docSearchQuery.toLowerCase().trim();
    const nameMatch = doc.name.toLowerCase().includes(q);
    const titleMatch = doc.title?.toLowerCase().includes(q) ?? false;
    const notesMatch = doc.notes?.toLowerCase().includes(q) ?? false;
    const tagsMatch = doc.tags?.some((t) => t.toLowerCase().includes(q)) ?? false;
    return nameMatch || titleMatch || notesMatch || tagsMatch;
  });

  return (
    <div
      style={isLgScreen ? { flex: `0 0 calc(${100 - leftPercent}% - 6px)` } : undefined}
      className="flex flex-col border border-border rounded-xl bg-card overflow-hidden h-full shadow-xs"
    >
      <div className="bg-muted px-4 py-3 border-b border-border font-semibold text-sm text-foreground flex items-center justify-between shrink-0">
        <span>{t("case_documents")}</span>
        {selectedCase && documents.length > 0 && (
          <span className="text-xs text-muted-foreground font-normal">{documents.length} {t("file_count")}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!selectedCase ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted-foreground/40 mb-3"
            >
              <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            </svg>
            <p className="text-sm font-semibold">{t("no_case_selected")}</p>
            <p className="text-xs text-muted-foreground/80 mt-1 max-w-[280px]">
              {t("select_case_desc")}
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Active Case Details Header */}
            <div className="pb-2 border-b border-border/60 flex items-center justify-between gap-4">
              <OpenDocumentsPanelTopMenu
                selectedCase={selectedCase}
                activeRightTab={activeRightTab}
                onTabChange={onTabChange}
                onShowFields={onShowFields}
                onAddDocument={onAddDocument}
              />
            </div>

            {/* Case File Search Bar */}
            {documents.length > 0 && (
              <CaseManagementSearch
                value={docSearchQuery}
                onChange={setDocSearchQuery}
              />
            )}

            <OpenCasesDocumentsPanelList
              docsLoading={docsLoading}
              docsError={docsError}
              documents={documents}
              filteredDocs={filteredDocs}
              selectedDocument={selectedDocument}
              onSelectDocument={onSelectDocument}
              onOpenFile={onOpenFile}
              onEditAnnotations={onEditAnnotations}
              onRemoveDocument={onRemoveDocument}
            />

            {activeRightTab === "emails" && attachments && attachments.length > 0 && (
              <div className="pt-4 border-t border-border mt-4">
                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-2">
                  📎 {t("attachments") || "Attachments"}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {attachments.map((att, index) => (
                    <div
                      key={index}
                      onClick={() => onOpenFile(att.staged_path)}
                      className="rounded-lg border border-border p-3 hover:border-primary/40 dark:hover:border-primary/45 bg-card hover:shadow-xs transition-all duration-150 flex items-center gap-3 cursor-pointer group animate-fade-in"
                    >
                      <span className="text-muted-foreground group-hover:text-primary transition-colors">📎</span>
                      <h4
                        className="font-semibold text-xs text-foreground truncate group-hover:text-primary transition-colors leading-tight"
                        title={att.name}
                      >
                        {att.name}
                      </h4>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
