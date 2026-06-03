import { useState } from "react";
import { Button } from "@/components/ui/button";
import OpenCasesFileIcon from "./OpenCasesFileIcon";
import { useLanguage } from "../../../context/LanguageContext";

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
              <div>
                <h3 className="text-lg font-bold text-foreground leading-snug">{selectedCase.subject || t("no_subject")}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{t("customer")}: {selectedCase.name}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onShowFields}
                  className="text-xs px-3 h-8 gap-1.5 border-border hover:bg-muted"
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
                    <rect width="18" height="18" x="3" y="3" rx="2" />
                    <path d="M7 8h10" />
                    <path d="M7 12h10" />
                    <path d="M7 16h10" />
                  </svg>
                  {t("case_fields")}
                </Button>
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
            </div>

            {/* Case File Search Bar */}
            {documents.length > 0 && (
              <div className="relative flex items-center">
                <span className="absolute left-2.5 rtl:left-auto rtl:right-2.5 text-muted-foreground">
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
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder={t("filter_files_placeholder")}
                  value={docSearchQuery}
                  onChange={(e) => setDocSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background pl-8 pr-7 rtl:pr-8 rtl:pl-7 py-1.5 text-xs placeholder:text-muted-foreground/80 focus:outline-none focus:ring-1 focus:ring-ring transition-all"
                />
                {docSearchQuery && (
                  <button
                    onClick={() => setDocSearchQuery("")}
                    className="absolute right-2 rtl:right-auto rtl:left-2 text-muted-foreground hover:text-foreground p-0.5"
                    title="Clear filter"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                )}
              </div>
            )}

            {/* Documents List */}
            <div className="space-y-2">
              <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-2">
                {t("files_in_folder")}
              </div>

              {docsLoading ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <div className="animate-spin text-xl font-bold mb-1">⟳</div>
                  <p className="text-xs">{t("loading_files")}</p>
                </div>
              ) : docsError ? (
                <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-xs text-destructive">
                  <span className="font-bold">{t("error_loading_files")}</span>
                  {docsError}
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-border rounded-lg text-muted-foreground p-4">
                  <p className="text-xs font-medium">{t("no_files_found")}</p>
                  <p className="text-[10px] text-muted-foreground/80 mt-1">
                    {t("no_files_found_desc")}
                  </p>
                </div>
              ) : filteredDocs.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-border rounded-lg text-muted-foreground p-4">
                  <p className="text-xs font-medium">{t("no_files_match")}</p>
                  <p className="text-[10px] text-muted-foreground/80 mt-1">
                    {t("no_files_match_desc")}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5">
                  {filteredDocs.map((doc) => (
                    <div
                      key={doc.path}
                      onClick={() => {
                        if (onSelectDocument) {
                          onSelectDocument(doc);
                        } else {
                          onOpenFile(doc.path);
                        }
                      }}
                      className={`rounded-lg border p-3 hover:shadow-xs transition-all duration-150 flex items-center justify-between gap-4 group cursor-pointer ${
                        selectedDocument?.path === doc.path
                          ? "border-primary bg-primary/5 dark:bg-primary/10"
                          : "border-border hover:border-primary/40 dark:hover:border-primary/45 bg-card"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Visual file-type icon */}
                        <OpenCasesFileIcon ext={doc.ext} />
                        <div className="min-w-0 flex-1">
                          <h4
                            className="font-semibold text-xs text-foreground truncate group-hover:text-primary transition-colors pr-2 leading-tight"
                            title={doc.title || doc.name}
                          >
                            {doc.title || doc.name}
                          </h4>
                          <p
                            className="text-[10px] text-muted-foreground mt-1.5 font-mono truncate"
                            title={doc.title ? doc.name : undefined}
                          >
                            {doc.title ? `${doc.name} • ` : ""}{doc.size_kb} KB • .{doc.ext.toUpperCase()}
                          </p>

                          {/* Render tags if any */}
                          {doc.tags && doc.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {doc.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-semibold border border-primary/20 tracking-wide uppercase select-none"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Render notes if any */}
                          {doc.notes && (
                            <p className="text-[10px] text-muted-foreground/80 mt-1.5 italic line-clamp-2 border-l-2 border-border/85 pl-1.5 bg-muted/20 py-0.5 rounded-r">
                              "{doc.notes}"
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEditAnnotations(doc)}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-primary/5"
                          title={t("edit_notes_tags")}
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
                            <path d="M12 2H2v10l9.29 9.29c.39.39 1.02.39 1.41 0l8.59-8.59c.39-.39.39-1.02 0-1.41L12 2z" />
                            <path d="M7 7h.01" />
                          </svg>
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onOpenFile(doc.path)}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-primary/5"
                          title={t("open_external")}
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
                            <path d="M15 3h6v6" />
                            <path d="M10 14 21 3" />
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          </svg>
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onRemoveDocument(doc)}
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title={t("remove_document")}
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
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
