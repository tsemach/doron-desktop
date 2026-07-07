import OpenCasesFileIcon from "./OpenCasesFileIcon";
import { CaseFile } from "../CaseManagementTypes";

export interface OpenCasesDocumentContentProps {
  doc: CaseFile;
}

export default function OpenCasesDocumentContent({ doc }: OpenCasesDocumentContentProps) {
  return (
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
  );
}
