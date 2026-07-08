import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

interface DocsManagementTemplatesMainFullProps {
  filteredUniqueFields: string[];
  uniqueFieldsMap: Record<string, { count: number; docNames: string[] }>;
}

function FieldItem({ field, docCount, sourceDocs }: { field: string; docCount: number; sourceDocs: string }) {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopy = () => {
    setIsCopied(true);

    const textToCopy = `[[${field}]]`;
    invoke("write_clipboard", { text: textToCopy }).catch((err) => {
      console.error("Failed to copy to native clipboard: ", err);
    });

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsCopied(false);
      timeoutRef.current = null;
    }, 2000);
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
      onClick={handleCopy}
      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border font-mono text-xs shadow-xs cursor-pointer select-none transition-all duration-150 relative group ${
        isCopied
          ? "bg-green-500/10 border-green-500 text-green-600 dark:text-green-400 font-bold shadow-sm"
          : "bg-muted/40 hover:bg-muted/90 border-border hover:border-primary/40 text-foreground/80 hover:shadow-sm"
      }`}
    >
      {/* Custom CSS Tooltip */}
      <div
        className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 bg-neutral-900 dark:bg-neutral-950 text-white text-[10px] rounded-lg shadow-xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-100 z-50 origin-bottom border border-neutral-800 font-sans leading-relaxed text-center ${
          isCopied ? "hidden" : ""
        }`}
      >
        <div className="font-semibold text-neutral-200 mb-0.5">Placeholder: [[{field}]]</div>
        <div className="text-neutral-400 text-[9px]">Used in {docCount} template(s):</div>
        <div className="text-neutral-300 font-mono mt-1 whitespace-pre-line text-left leading-normal text-[9px]">
          {sourceDocs}
        </div>
        {/* Tooltip Arrow */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900 dark:border-t-neutral-950" />
      </div>

      {/* Copy success tooltip banner */}
      {isCopied && (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-green-600 text-white text-[9px] font-bold px-2 py-0.5 rounded shadow-md z-10 animate-bounce">
          Copied!
        </span>
      )}

      <div className="flex items-center gap-2 min-w-0">
        {isCopied ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-green-600 dark:text-green-400 shrink-0"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
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
            className="text-primary/70 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity"
          >
            <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" />
            <path d="M7 7h.01" />
          </svg>
        )}
        <span className="truncate font-semibold text-foreground/80" title={field}>
          {field}
        </span>
      </div>

      {/* Variable state icons */}
      <div className="flex items-center gap-1.5 shrink-0">
        {docCount > 1 && (
          <span
            className={`text-[9px] rounded-full px-1.5 py-0.2 border shrink-0 ${
              isCopied
                ? "bg-green-500/20 border-green-500/30 text-green-700 dark:text-green-300"
                : "bg-primary/5 border-primary/20 text-primary font-semibold"
            }`}
          >
            x{docCount}
          </span>
        )}

        {!isCopied && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground opacity-30 group-hover:opacity-100 transition-opacity shrink-0"
          >
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
        )}
      </div>
    </div>
  );
}

export default function DocsManagementTemplatesMainFull({
  filteredUniqueFields,
  uniqueFieldsMap,
}: DocsManagementTemplatesMainFullProps) {
  if (filteredUniqueFields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic text-center py-6">
        No fields match your search.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-1">
      {filteredUniqueFields.map((field) => {
        const docCount = uniqueFieldsMap[field].count;
        const sourceDocs = uniqueFieldsMap[field].docNames.map((name) => `• ${name}`).join("\n");

        return (
          <FieldItem
            key={field}
            field={field}
            docCount={docCount}
            sourceDocs={sourceDocs}
          />
        );
      })}
    </div>
  );
}
