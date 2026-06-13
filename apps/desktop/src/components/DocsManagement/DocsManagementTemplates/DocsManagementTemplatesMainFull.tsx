import { useState } from "react";

interface DocsManagementTemplatesMainFullProps {
  filteredUniqueFields: string[];
  uniqueFieldsMap: Record<string, { count: number; docNames: string[] }>;
}

export default function DocsManagementTemplatesMainFull({
  filteredUniqueFields,
  uniqueFieldsMap,
}: DocsManagementTemplatesMainFullProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopyField = (fieldName: string) => {
    const textToCopy = `[[${fieldName}]]`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedField(fieldName);
    setTimeout(() => {
      setCopiedField(null);
    }, 1500);
  };

  if (filteredUniqueFields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic text-center py-6">
        No fields match your search.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {filteredUniqueFields.map((field) => {
        const isCopied = copiedField === field;
        const docCount = uniqueFieldsMap[field].count;
        const sourceDocs = uniqueFieldsMap[field].docNames.map(name => `• ${name}`).join("\n");

        return (
          <div
            key={field}
            onClick={() => handleCopyField(field)}
            className={`text-xs font-mono px-2.5 py-1.5 rounded-lg border cursor-pointer select-none relative group transition-all duration-150 flex items-center gap-2 ${isCopied
              ? "bg-green-500/10 border-green-500 text-green-600 dark:text-green-400 font-bold shadow-sm"
              : "bg-muted/40 hover:bg-muted/95 border-border hover:border-primary/40 text-foreground hover:scale-102 hover:shadow-sm"
              }`}
            title={`Placeholder format: [[${field}]]\nUsed in ${docCount} template(s):\n${sourceDocs}`}
          >
            {/* Copy success tooltip banner */}
            {isCopied && (
              <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-green-600 text-white text-[9px] font-bold px-2 py-0.5 rounded shadow-md z-10 animate-bounce">
                Copied!
              </span>
            )}

            <span>[[ {field} ]]</span>

            {/* Variable state icons */}
            <div className="flex items-center gap-1.5">
              {docCount > 1 && (
                <span className={`text-[9px] rounded-full px-1.5 py-0.2 border shrink-0 ${isCopied
                  ? "bg-green-500/20 border-green-500/30 text-green-700 dark:text-green-300"
                  : "bg-primary/5 border-primary/20 text-primary font-semibold"
                  }`}>
                  x{docCount}
                </span>
              )}

              {isCopied ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground opacity-30 group-hover:opacity-100 transition-opacity">
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
