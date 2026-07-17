import { DocTemplate } from "./CaseManagementTypes";

interface CaseManagementPreviewDocumentProps {
  doc: DocTemplate;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenFile: (e: React.MouseEvent) => void;
}

export default function CaseManagementPreviewDocument({
  doc,
  isExpanded,
  onToggle,
  onOpenFile,
}: CaseManagementPreviewDocumentProps) {
  return (
    <div
      className={`rounded-lg p-3 transition-colors duration-150 flex flex-col justify-between cursor-pointer select-none ${
        isExpanded
          ? "bg-primary/10"
          : "bg-muted/30 hover:bg-muted/50"
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
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
            className="text-primary shrink-0"
          >
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
            <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          </svg>
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground truncate" title={doc.title || doc.file_name}>
              {doc.title || doc.file_name}
            </p>
            <p className="text-[9px] text-muted-foreground font-mono truncate">
              {doc.file_name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onOpenFile}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-all shrink-0"
            title="Open template file"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 3h6v6" />
              <path d="M10 14 21 3" />
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            </svg>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={`p-1 rounded hover:bg-muted transition-all shrink-0 ${
              isExpanded ? "text-primary rotate-180" : "text-muted-foreground"
            }`}
            title={isExpanded ? "Collapse preview" : "Expand preview"}
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
              className="transition-transform duration-200"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
