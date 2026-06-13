import { useState } from "react";
import OpenCasesFileIcon from "./OpenCasesFileIcon";
import OpenCasesDocumentPanelControl from "./OpenCasesDocumentPanelControl";
import { useLanguage } from "../../../context/LanguageContext";

import { CaseFile } from "../CaseManagementTypes";

interface OpenCasesDocumentsPanelListProps {
  docsLoading: boolean;
  docsError: string | null;
  documents: CaseFile[];
  filteredDocs: CaseFile[];
  selectedDocument?: CaseFile | null;
  onSelectDocument?: (doc: CaseFile) => void;
  onOpenFile: (filePath: string) => void;
  onEditAnnotations: (doc: CaseFile) => void;
  onRemoveDocument: (doc: CaseFile) => void;
  onDropAttachment?: (att: { name: string; staged_path: string; size_kb: number }) => void;
}

export default function OpenCasesDocumentsPanelList({
  docsLoading,
  docsError,
  documents,
  filteredDocs,
  selectedDocument,
  onSelectDocument,
  onOpenFile,
  onEditAnnotations,
  onRemoveDocument,
  onDropAttachment,
}: OpenCasesDocumentsPanelListProps) {
  const { t } = useLanguage();
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (onDropAttachment) {
          setIsDragOver(true);
        }
      }}
      onDragLeave={() => {
        setIsDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (onDropAttachment) {
          try {
            const dataStr = e.dataTransfer.getData("application/json");
            if (dataStr) {
              const att = JSON.parse(dataStr);
              if (att && att.staged_path) {
                onDropAttachment(att);
              }
            }
          } catch (err) {
            console.error("Drop attachment error:", err);
          }
        }
      }}
      className={`space-y-2 rounded-xl transition-all duration-200 border-2 ${
        isDragOver
          ? "border-primary border-dashed bg-primary/5 p-3"
          : "border-transparent"
      }`}
    >
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

              <OpenCasesDocumentPanelControl
                doc={doc}
                onEditAnnotations={onEditAnnotations}
                onOpenFile={onOpenFile}
                onRemoveDocument={onRemoveDocument}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
