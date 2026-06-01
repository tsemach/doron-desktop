import { useState, useEffect } from "react";
import { Button } from "../../ui/button";
import { TemplateRow } from "./DocsManagementTemplates.types";

interface DocsManagementTemplatesEmptyStateProps {
  onAddTemplate: () => void;
  isProcessing: boolean;
  templates: TemplateRow[];
}

export default function DocsManagementTemplatesEmptyState({
  onAddTemplate,
  isProcessing,
  templates,
}: DocsManagementTemplatesEmptyStateProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"unique" | "by_doc">("unique");

  // Track copy status for individual fields and document cards
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [copiedDocId, setCopiedDocId] = useState<number | null>(null);

  // Clean copied states
  useEffect(() => {
    return () => {
      setCopiedField(null);
      setCopiedDocId(null);
    };
  }, []);

  const handleCopyField = (fieldName: string) => {
    const textToCopy = `[[${fieldName}]]`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedField(fieldName);
    setTimeout(() => {
      setCopiedField(null);
    }, 1500);
  };

  const handleCopyAllFields = (docId: number, fields: string[]) => {
    const textToCopy = fields.map((f) => `[[${f}]]`).join("\n");
    navigator.clipboard.writeText(textToCopy);
    setCopiedDocId(docId);
    setTimeout(() => {
      setCopiedDocId(null);
    }, 1500);
  };

  // Safe parsing helper
  const parseFields = (fieldsJson: string): string[] => {
    try {
      const parsed = JSON.parse(fieldsJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  // Construct structured templates with fields list
  const docFieldsList = templates.map((t) => {
    const fields = parseFields(t.fields_found);
    return {
      id: t.id,
      file_name: t.file_name,
      title: t.title,
      fields: fields.sort(),
    };
  });

  // Calculate unique fields dictionary
  const uniqueFieldsMap: Record<string, { count: number; docNames: string[] }> = {};
  docFieldsList.forEach(({ file_name, title, fields }) => {
    const displayName = title || file_name;
    fields.forEach((f) => {
      if (!uniqueFieldsMap[f]) {
        uniqueFieldsMap[f] = { count: 0, docNames: [] };
      }
      uniqueFieldsMap[f].count += 1;
      uniqueFieldsMap[f].docNames.push(displayName);
    });
  });

  const uniqueFieldsList = Object.keys(uniqueFieldsMap).sort();

  // Filters
  const filteredUniqueFields = uniqueFieldsList.filter((f) =>
    f.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredDocFields = docFieldsList
    .map((doc) => {
      const matchingFields = doc.fields.filter((f) =>
        f.toLowerCase().includes(searchQuery.toLowerCase())
      );
      const docMatches =
        doc.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.title && doc.title.toLowerCase().includes(searchQuery.toLowerCase()));

      if (docMatches || matchingFields.length > 0) {
        return {
          ...doc,
          fields: docMatches ? doc.fields : matchingFields,
        };
      }
      return null;
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  // If there are no templates, show the original centered empty state
  if (templates.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 bg-background">
        <div className="w-16 h-16 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="9" y1="15" x2="15" y2="15" />
            <line x1="9" y1="11" x2="15" y2="11" />
          </svg>
        </div>
        <div className="space-y-1.5 max-w-md">
          <h3 className="text-sm font-bold text-foreground">No Document Template Selected</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Choose a template from the list on the left to fill placeholders and auto-generate new
            filled copies, or upload a new template to get started.
          </p>
        </div>
        <Button size="sm" onClick={onAddTemplate} disabled={isProcessing}>
          Upload New Template
        </Button>
      </div>
    );
  }

  // Full-width Layout
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">

        {/* Header containing title, tabs & search */}
        <div className="p-4 border-b border-border/60 bg-muted/5 flex flex-col gap-4 shrink-0">
          <div className="flex items-center gap-2">
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
              className="text-primary"
            >
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
              <path d="M6 6h10" />
              <path d="M6 10h10" />
            </svg>
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Available Fields Dictionary
            </h4>
          </div>

          <div className="flex flex-col gap-3">
            {/* Tabs Selector */}
            <div className="inline-flex rounded-lg bg-muted p-1 text-muted-foreground text-[11px] self-start select-none">
              <button
                onClick={() => setActiveTab("unique")}
                className={`px-3 py-1.2 rounded-md font-medium transition-all cursor-pointer ${activeTab === "unique"
                    ? "bg-background text-foreground shadow-sm"
                    : "hover:text-foreground"
                  }`}
              >
                All Unique Fields ({filteredUniqueFields.length})
              </button>
              <button
                onClick={() => setActiveTab("by_doc")}
                className={`px-3 py-1.2 rounded-md font-medium transition-all cursor-pointer ${activeTab === "by_doc"
                    ? "bg-background text-foreground shadow-sm"
                    : "hover:text-foreground"
                  }`}
              >
                By Document ({filteredDocFields.length})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full">
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
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="text"
                placeholder="Search variables or document names..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-md border border-input bg-card pl-8 pr-8 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground font-semibold text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Dictionary Content */}
        <div className="flex-1 overflow-y-auto pt-8 px-4 pb-4 space-y-4">
          {activeTab === "unique" ? (

            /* 1. Flat unique fields tags grid */
            filteredUniqueFields.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-6">No fields match your search.</p>
            ) : (
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
            )
          ) : (

            /* 2. Grouped By Document Cards Grid */
            filteredDocFields.length === 0 ? (
              <p className="text-xs text-muted-foreground italic text-center py-6">No matching templates found.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredDocFields.map((doc) => {
                  const hasFields = doc.fields.length > 0;
                  const isDocCopied = copiedDocId === doc.id;
                  const displayName = doc.title || doc.file_name;
                  const isDescriptiveTitle = !!doc.title;

                  return (
                    <div
                      key={doc.id}
                      className="border border-border/80 bg-card rounded-xl p-4 flex flex-col justify-between hover:border-primary/20 hover:shadow-sm transition-all duration-200"
                    >
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
                              onClick={() => handleCopyAllFields(doc.id, doc.fields)}
                              className={`text-[10px] font-medium shrink-0 flex items-center gap-1 hover:underline cursor-pointer transition-colors ${isDocCopied ? "text-green-600 dark:text-green-400 font-bold" : "text-primary"
                                }`}
                            >
                              {isDocCopied ? (
                                <>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="inline">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                  Copied All!
                                </>
                              ) : (
                                <>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline">
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
                            {doc.fields.map((field) => {
                              const isFieldCopied = copiedField === `${doc.id}_${field}`;

                              return (
                                <div
                                  key={field}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const textToCopy = `[[${field}]]`;
                                    navigator.clipboard.writeText(textToCopy);
                                    setCopiedField(`${doc.id}_${field}`);
                                    setTimeout(() => {
                                      setCopiedField(null);
                                    }, 1500);
                                  }}
                                  className={`text-[10px] font-mono px-2 py-1 rounded border cursor-pointer select-none transition-all duration-150 flex items-center gap-1 group relative ${isFieldCopied
                                      ? "bg-green-500/10 border-green-500 text-green-600 dark:text-green-400 font-bold"
                                      : "bg-muted/20 hover:bg-muted/70 border-border hover:border-primary/30 text-foreground"
                                    }`}
                                  title={`Click to copy: [[${field}]]`}
                                >
                                  {isFieldCopied && (
                                    <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-green-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm z-10 animate-bounce">
                                      Copied!
                                    </span>
                                  )}
                                  <span>[[ {field} ]]</span>

                                  {isFieldCopied ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 dark:text-green-400">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground opacity-30 group-hover:opacity-100 transition-opacity">
                                      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                                    </svg>
                                  )}
                                </div>
                              );
                            })}
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
                })}
              </div>
            )
          )}
        </div>

      </div>
  );
}
