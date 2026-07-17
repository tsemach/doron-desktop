import OpenCasesDocumentContent from "./OpenCasesDocumentContent";
import OpenCasesDocumentControl from "./OpenCasesDocumentControl";
import { CaseFile } from "../CaseManagementTypes";

export interface OpenCasesDocumentProps {
  doc: CaseFile;
  selectedDocument?: CaseFile | null;
  onSelectDocument?: (doc: CaseFile) => void;
  onOpenFile: (filePath: string) => void;
  onEditAnnotations: (doc: CaseFile) => void;
  onRemoveDocument: (doc: CaseFile) => void;
}

export default function OpenCasesDocument({
  doc,
  selectedDocument,
  onSelectDocument,
  onOpenFile,
  onEditAnnotations,
  onRemoveDocument,
}: OpenCasesDocumentProps) {
  return (
    <div
      onClick={() => {
        if (onSelectDocument) {
          onSelectDocument(doc);
        } else {
          onOpenFile(doc.path);
        }
      }}
      className={`rounded-lg border p-3 hover:shadow-xs transition-all duration-150 flex items-center justify-between gap-4 group cursor-pointer ${selectedDocument?.path === doc.path
          ? "border-primary bg-primary/5 dark:bg-primary/10"
          : "border-border hover:border-primary/40 dark:hover:border-primary/45 bg-card hover:bg-muted/50"
        }`}
    >
      <OpenCasesDocumentContent doc={doc} onOpenFile={onOpenFile} />

      <OpenCasesDocumentControl
        doc={doc}
        onEditAnnotations={onEditAnnotations}
        onRemoveDocument={onRemoveDocument}
      />
    </div>
  );
}
