import OpenCasesFileIcon from "./OpenCasesFileIcon";
import { CaseFile } from "../CaseManagementTypes";
import TagChip from "@/components/ui/TagChip";
import { useLanguage } from "../../../context/LanguageContext";

export interface OpenCasesDocumentContentProps {
  doc: CaseFile;
  onOpenFile: (filePath: string) => void;
}

export default function OpenCasesDocumentContent({ doc, onOpenFile }: OpenCasesDocumentContentProps) {
  const { t } = useLanguage();

  return (
    <div className="flex items-center gap-3 min-w-0">
      {/* Visual file-type icon */}
      <OpenCasesFileIcon ext={doc.ext} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-1 min-w-0">
          <h4
            className="font-semibold text-xs text-foreground truncate group-hover:text-primary transition-colors leading-tight min-w-0"
            title={doc.title || doc.name}
          >
            {doc.title || doc.name}
          </h4>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenFile(doc.path);
            }}
            className="shrink-0 text-muted-foreground hover:text-foreground hover:bg-primary/10 rounded p-0.5 -mt-0.5 transition-colors"
            title={t("open_external")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="11"
              height="11"
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
        </div>
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
              <TagChip key={tag.name} tag={tag} />
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
  );
}
