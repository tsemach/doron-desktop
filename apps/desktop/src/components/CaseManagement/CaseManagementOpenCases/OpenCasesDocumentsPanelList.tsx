import { useState } from "react";
import OpenCasesDocument from "./OpenCasesDocument";
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
            <OpenCasesDocument
              key={doc.path}
              doc={doc}
              selectedDocument={selectedDocument}
              onSelectDocument={onSelectDocument}
              onOpenFile={onOpenFile}
              onEditAnnotations={onEditAnnotations}
              onRemoveDocument={onRemoveDocument}
            />
          ))}
        </div>
      )}
    </div>
  );
}
