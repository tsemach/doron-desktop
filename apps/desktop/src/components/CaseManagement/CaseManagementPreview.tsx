import { DocTemplate } from "./CaseManagementTypes";
import DocumentPlaceholderPreview from "./DocumentPlaceholderPreview";
import CaseManagementPreviewDocument from "./CaseManagementPreviewDocument";

interface CaseManagementPreviewProps {
  isLgScreen: boolean;
  bottomPercent: number;
  showAllPreviews: boolean;
  onShowAllPreviewsChange: (value: boolean) => void;
  focusedField: string | null;
  onFocusedFieldChange: (value: string | null) => void;
  associatedDocs: DocTemplate[];
  fieldToDocsMap: Record<string, DocTemplate[]>;
  expandedDocId: number | null;
  onExpandedDocIdChange: (value: number | null) => void;
  onToggleDocContext: (docId: number) => void;
  onOpenTemplateFile: (e: React.MouseEvent, filePath: string) => void;
  docTemplates: DocTemplate[];
  loadingContext: boolean;
  previewError: string | null;
  docHtmlCache: Record<number, string>;
  templateFields: string[];
  fieldValues: Record<string, string>;
  onFieldClickFromPreview: (field: string) => void;
}

export default function CaseManagementPreview({
  isLgScreen,
  bottomPercent,
  showAllPreviews,
  onShowAllPreviewsChange,
  focusedField,
  onFocusedFieldChange,
  associatedDocs,
  fieldToDocsMap,
  expandedDocId,
  onExpandedDocIdChange,
  onToggleDocContext,
  onOpenTemplateFile,
  docTemplates,
  loadingContext,
  previewError,
  docHtmlCache,
  templateFields,
  fieldValues,
  onFieldClickFromPreview,
}: CaseManagementPreviewProps) {
  return (
    <div
      className="flex flex-col min-h-0 border border-border/80 bg-background/50 rounded-lg pt-4 px-0 pb-0 -mb-px space-y-2 shrink-0"
      style={isLgScreen ? { maxHeight: `${bottomPercent}%` } : { maxHeight: "350px" }}
    >
      <div className="flex justify-between items-center shrink-0 pb-1 border-b border-border/60">
        <div className="pl-2">
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
            {showAllPreviews ? (
              "All Document Previews"
            ) : (
              <>Context for Field: <span className="font-mono text-primary">{focusedField}</span></>
            )}
          </h4>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {showAllPreviews
              ? "Every document in this case template. Select a card below to view its context snippet."
              : "Select a document card below to view its context snippet."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            onFocusedFieldChange(null);
            onShowAllPreviewsChange(false);
            onExpandedDocIdChange(null);
          }}
          className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors text-xs font-semibold"
          title="Close context drawer"
        >
          ✕
        </button>
      </div>

      {/* Context Body: Grid of associated document cards */}
      <div className="flex-1 flex flex-col min-h-0 gap-2 -mb-px">
        {(() => {
          const docs = showAllPreviews
            ? associatedDocs
            : (focusedField ? fieldToDocsMap[focusedField] || [] : []);
          if (docs.length === 0) {
            return (
              <div className="flex items-center justify-center h-full text-center text-xs text-muted-foreground italic py-4">
                {showAllPreviews
                  ? "This case template has no associated documents."
                  : "This field is manually added and does not belong to any document templates."}
              </div>
            );
          }

          return (
            <>
              {/* Horizontal grid of document cards (scrolls independently if too many) */}
              <div className="shrink-0 overflow-y-auto max-h-[150px] pr-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {docs.map((doc) => (
                    <CaseManagementPreviewDocument
                      key={doc.id}
                      doc={doc}
                      isExpanded={expandedDocId === doc.id}
                      onToggle={() => onToggleDocContext(doc.id)}
                      onOpenFile={(e) => onOpenTemplateFile(e, doc.marked_path)}
                    />
                  ))}
                </div>
              </div>

              {/* Full-width context snippet container below the grid if any card is expanded */}
              {expandedDocId && (
                <div className="flex-1 min-h-0 flex flex-col border border-border/80 rounded-lg pt-3 px-3 pb-0 bg-muted/20 space-y-1.5 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex justify-between items-center pb-1 border-b border-border/40 shrink-0">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Document Live Preview
                    </span>
                    <span className="text-[9px] text-muted-foreground font-mono">
                      {docTemplates.find(d => d.id === expandedDocId)?.file_name}
                    </span>
                  </div>
                  <div className="flex-1 min-h-0 flex flex-col justify-center overflow-hidden">
                    {loadingContext ? (
                      <div className="py-6 flex items-center justify-center text-xs text-muted-foreground">
                        <svg
                          className="animate-spin -ml-1 mr-3 h-4 w-4 text-primary"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Loading template preview...
                      </div>
                    ) : previewError ? (
                      <div className="py-4 text-center text-xs text-destructive bg-destructive/10 rounded border border-destructive/20">
                        {previewError}
                      </div>
                    ) : docHtmlCache[expandedDocId] ? (
                      <DocumentPlaceholderPreview
                        html={docHtmlCache[expandedDocId]}
                        fields={templateFields}
                        fieldValues={fieldValues}
                        focusedField={focusedField}
                        onFieldClick={onFieldClickFromPreview}
                        className="flex-1 min-h-0 w-full overflow-y-auto bg-background/80 dark:bg-background/20 pt-3 px-3 pb-0 rounded-lg border border-border/40 relative select-text"
                      />
                    ) : (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        No preview available
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
