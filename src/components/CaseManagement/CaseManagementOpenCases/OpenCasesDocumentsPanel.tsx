import { useState } from "react";
import { useLanguage } from "../../../context/LanguageContext";
import CaseManagementSearch from "../CaseManagementSearch";
import OpenCasesDocumentsPanelList from "./OpenCasesDocumentsPanelList";
import OpenDocumentsPanelTopMenu from "./OpenCasesDocumentsPanelTopMenu";

import { Case, CaseFile } from "../CaseManagementTypes";

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
  onEditCaseAnnotations?: () => void;
  onShowFields: () => void;
  onAddDocument: () => void;
  onSelectDocument?: (doc: CaseFile) => void;
  selectedDocument?: CaseFile | null;
  activeRightTab?: "preview" | "emails";
  onTabChange?: (tab: "preview" | "emails") => void;
  attachments?: { name: string; staged_path: string; size_kb: number }[];
  onRemoveAttachment?: (att: { name: string; staged_path: string; size_kb: number }) => void;
  onCopyAttachmentToCase?: (att: { name: string; staged_path: string; size_kb: number }) => void;
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
  onEditCaseAnnotations,
  onShowFields,
  onAddDocument,
  onSelectDocument,
  selectedDocument,
  activeRightTab = "preview",
  onTabChange,
  attachments = [],
  onRemoveAttachment,
  onCopyAttachmentToCase,
}: OpenCasesDocumentsPanelProps) {
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(true);
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

      <div className="flex-1 flex flex-col min-h-0">
        {!selectedCase ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center overflow-y-auto">
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
          <div className="flex-1 flex flex-col min-h-0 pt-4 pb-3 pl-4 pr-1.5 space-y-2">
            {/* Active Case Details Header */}
            <div className="pb-2 border-b border-border/60 flex items-center justify-between gap-4 shrink-0">
              <OpenDocumentsPanelTopMenu
                selectedCase={selectedCase}
                activeRightTab={activeRightTab}
                onTabChange={onTabChange}
                onShowFields={onShowFields}
                onAddDocument={onAddDocument}
                onEditCaseAnnotations={onEditCaseAnnotations}
              />
            </div>

            {/* Case File Search Bar */}
            {documents.length > 0 && (
              <div className="shrink-0">
                <CaseManagementSearch
                  value={docSearchQuery}
                  onChange={setDocSearchQuery}
                />
              </div>
            )}

            {/* Sticky files_in_folder label & scroll list wrapper */}
            <div className="flex-1 flex flex-col min-h-0 space-y-2">
              {/* <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider shrink-0 select-none">
                {t("files_in_folder")}
              </div> */}

              <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-3">
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
                  onDropAttachment={onCopyAttachmentToCase}
                />

                {activeRightTab === "emails" && attachments && attachments.length > 0 && (() => {
                  // Deduplicate attachments by name
                  const uniqueAttachments = Array.from(
                    new Map(attachments.map(att => [att.name, att])).values()
                  );

                  return (
                    <div className="pt-4 border-t border-border mt-4">
                      <button
                        onClick={() => setAttachmentsExpanded(!attachmentsExpanded)}
                        className="w-full flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-2 hover:text-foreground transition-colors focus:outline-none focus:ring-0 cursor-pointer select-none leading-none"
                        type="button"
                      >
                        <span className="text-xs flex items-center justify-center leading-none">📎</span>
                        <span className={`text-xs flex items-center justify-center transition-transform duration-200 select-none leading-none font-sans ${attachmentsExpanded ? "rotate-90" : ""}`}>
                          ▸
                        </span>
                        <span className="flex items-center leading-none">
                          {t("attachments") || "Attachments"} ({uniqueAttachments.length})
                        </span>
                      </button>
                      
                      {attachmentsExpanded && (
                        <div className="grid grid-cols-1 gap-2 pl-8">
                          {uniqueAttachments.map((att, index) => (
                            <div
                              key={index}
                              onClick={() => onOpenFile(att.staged_path)}
                              draggable={true}
                              onDragStart={(e) => {
                                  e.dataTransfer.setData("application/json", JSON.stringify(att));
                                  e.currentTarget.style.opacity = "0.5";
                              }}
                              onDragEnd={(e) => {
                                  e.currentTarget.style.opacity = "1";
                              }}
                              className="rounded-lg border border-border p-3 hover:border-primary/40 dark:hover:border-primary/45 bg-card hover:shadow-xs transition-all duration-150 flex items-center justify-between gap-3 cursor-pointer group animate-fade-in select-none"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <span className="text-muted-foreground group-hover:text-primary transition-colors shrink-0">📎</span>
                                <h4
                                  className="font-semibold text-xs text-foreground truncate group-hover:text-primary transition-colors leading-tight"
                                  title={att.name}
                                >
                                  {att.name}
                                </h4>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {onCopyAttachmentToCase && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onCopyAttachmentToCase(att);
                                    }}
                                    className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer shrink-0"
                                    title={t("copy_to_case") || "Copy & Update to Case Documents"}
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
                                    >
                                      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                                      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                                      <path d="M9 15h6" />
                                      <path d="M12 12v6" />
                                    </svg>
                                  </button>
                                )}
                                {onRemoveAttachment && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onRemoveAttachment(att);
                                    }}
                                    className="h-8 w-8 rounded-lg flex items-center justify-center text-destructive hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer shrink-0"
                                    title={t("remove_document") || "Remove attachment"}
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
                                    >
                                      <path d="M3 6h18" />
                                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                      <line x1="10" x2="10" y1="11" y2="17" />
                                      <line x1="14" x2="14" y1="11" y2="17" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
