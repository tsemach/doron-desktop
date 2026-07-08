import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface DocFieldItem {
  id: number;
  file_name: string;
  title?: string | null;
  fields: string[];
}

interface DocsManagementTemplatesMainDocProps {
  filteredDocFields: DocFieldItem[];
}

function DocFieldItemComponent({ field }: { field: string }) {
  const [isFieldCopied, setIsFieldCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopy = () => {
    setIsFieldCopied(true);

    const textToCopy = `[[${field}]]`;
    invoke("write_clipboard", { text: textToCopy }).catch((err) => {
      console.error("Failed to copy field: ", err);
    });

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsFieldCopied(false);
      timeoutRef.current = null;
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      key={field}
      onClick={(e) => {
        e.stopPropagation();
        handleCopy();
      }}
      className={`text-[10px] font-mono px-2 py-1 rounded border cursor-pointer select-none transition-all duration-150 flex items-center gap-1 group relative ${
        isFieldCopied
          ? "bg-green-500/10 border-green-500 text-green-600 dark:text-green-400 font-bold"
          : "bg-muted/20 hover:bg-muted/70 border-border hover:border-primary/30 text-foreground"
      }`}
    >
      {isFieldCopied && (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-green-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm z-10 animate-bounce">
          Copied!
        </span>
      )}
      <span>[[ {field} ]]</span>

      {isFieldCopied ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="8"
          height="8"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-green-600 dark:text-green-400"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="8"
          height="8"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-muted-foreground opacity-30 group-hover:opacity-100 transition-opacity"
        >
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
      )}
    </div>
  );
}

function DocTemplateCard({ doc }: { doc: DocFieldItem }) {
  const [isDocCopied, setIsDocCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopyAllFields = () => {
    setIsDocCopied(true);

    const textToCopy = doc.fields.map((f) => `[[${f}]]`).join("\n");
    invoke("write_clipboard", { text: textToCopy }).catch((err) => {
      console.error("Failed to copy all fields: ", err);
    });

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsDocCopied(false);
      timeoutRef.current = null;
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const hasFields = doc.fields.length > 0;
  const displayName = doc.title || doc.file_name;
  const isDescriptiveTitle = !!doc.title;

  return (
    <div className="border border-border/80 bg-card rounded-xl p-4 flex flex-col justify-between hover:border-primary/20 hover:shadow-sm transition-all duration-200">
      <div className="space-y-3">
        {/* Card Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border/40 pb-2">
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-foreground truncate" title={displayName}>
              {displayName}
            </h4>
            {isDescriptiveTitle && (
              <p className="text-[10px] text-muted-foreground truncate italic mt-0.5" title={doc.file_name}>
                {doc.file_name}
              </p>
            )}
          </div>

          {hasFields && (
            <button
              onClick={handleCopyAllFields}
              className={`text-[10px] font-medium shrink-0 flex items-center gap-1 hover:underline cursor-pointer transition-colors ${
                isDocCopied ? "text-green-600 dark:text-green-400 font-bold" : "text-primary"
              }`}
            >
              {isDocCopied ? (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="9"
                    height="9"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="inline animate-bounce"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copied All!
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="9"
                    height="9"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="inline"
                  >
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </svg>
                  Copy All
                </>
              )}
            </button>
          )}
        </div>

        {/* Card Body: Fields in Document */}
        {!hasFields ? (
          <p className="text-[10px] text-muted-foreground italic">No placeholders found in document.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 max-h-[140px] overflow-y-auto pt-7 px-1 pb-1">
            {doc.fields.map((field) => (
              <DocFieldItemComponent key={field} field={field} />
            ))}
          </div>
        )}
      </div>

      {/* Card Footer: Fields Info */}
      {hasFields && (
        <div className="text-[9px] text-muted-foreground font-medium pt-2 border-t border-border/20 mt-3 text-right">
          {doc.fields.length} variables found
        </div>
      )}
    </div>
  );
}

export default function DocsManagementTemplatesMainDoc({
  filteredDocFields,
}: DocsManagementTemplatesMainDocProps) {
  if (filteredDocFields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic text-center py-6">
        No matching templates found.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {filteredDocFields.map((doc) => (
        <DocTemplateCard key={doc.id} doc={doc} />
      ))}
    </div>
  );
}
