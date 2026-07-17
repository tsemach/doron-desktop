import { CaseTemplate, DocTemplate } from "./CaseManagementTypes";
import CaseManagementCaseCreateTemplateFieldsHeader from "./CaseManagementCaseCreateTemplateFieldsHeader";
import CaseManagementCaseCreateTemplateFieldsSelect from "./CaseManagementCaseCreateTemplateFieldsSelect";
import CaseManagementCaseCreateField from "./CaseManagementCaseCreateField";
import CaseManagementPreview from "./CaseManagementPreview";

interface CaseManagementCaseCreateTemplateFieldsProps {
  isLgScreen: boolean;
  activeTemplate: CaseTemplate | undefined;
  associatedDocs: DocTemplate[];
  showAllPreviews: boolean;
  onShowAllPreviewsChange: (value: boolean) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  uniqueRows: number[];
  selectedRow: number | null;
  onSelectedRowChange: (value: number | null) => void;
  filterDocId: number | null;
  onFilterDocIdChange: (value: number | null) => void;
  filteredTemplateFields: string[];
  fieldValues: Record<string, string>;
  onFieldValuesChange: (values: Record<string, string>) => void;
  focusedField: string | null;
  onFocusedFieldChange: (value: string | null) => void;
  loading: boolean;
  isDraggingHeight: boolean;
  onDraggingHeightChange: (value: boolean) => void;
  bottomPercent: number;
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
  onFieldClickFromPreview: (field: string) => void;
}

export default function CaseManagementCaseCreateTemplateFields({
  isLgScreen,
  activeTemplate,
  associatedDocs,
  showAllPreviews,
  onShowAllPreviewsChange,
  searchQuery,
  onSearchQueryChange,
  uniqueRows,
  selectedRow,
  onSelectedRowChange,
  filterDocId,
  onFilterDocIdChange,
  filteredTemplateFields,
  fieldValues,
  onFieldValuesChange,
  focusedField,
  onFocusedFieldChange,
  loading,
  isDraggingHeight,
  onDraggingHeightChange,
  bottomPercent,
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
  onFieldClickFromPreview,
}: CaseManagementCaseCreateTemplateFieldsProps) {
  return (
    <div
      id="right-fields-container"
      className={`rounded-lg border border-border bg-card p-4 animate-in fade-in slide-in-from-right-4 duration-300 min-w-0 flex flex-col gap-2 pb-0 ${
        isLgScreen ? "h-full" : ""
      }`}
      style={isLgScreen ? { flex: "1 1 0%" } : undefined}
    >
      {/* Top portion: fields list */}
      <div
        className="flex flex-col min-h-0"
        style={(focusedField || showAllPreviews) && isLgScreen ? { height: `${100 - bottomPercent}%` } : { flex: "1 1 0%" }}
      >
        <CaseManagementCaseCreateTemplateFieldsHeader
          activeTemplateName={activeTemplate?.name}
          associatedDocsCount={associatedDocs.length}
          onShowAllPreview={() => {
            onFocusedFieldChange(null);
            onExpandedDocIdChange(null);
            onShowAllPreviewsChange(true);
          }}
        />

        {/* Search and Document Filter Bar */}
        <CaseManagementCaseCreateTemplateFieldsSelect
          searchQuery={searchQuery}
          onSearchQueryChange={onSearchQueryChange}
          uniqueRows={uniqueRows}
          selectedRow={selectedRow}
          onSelectedRowChange={onSelectedRowChange}
          filterDocId={filterDocId}
          onFilterDocIdChange={onFilterDocIdChange}
          associatedDocs={associatedDocs}
        />

        {filteredTemplateFields.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground bg-muted/10 flex-1 flex items-center justify-center">
            No template fields match your search/filter query.
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-2 pb-2">
              {filteredTemplateFields.map((field) => (
                <CaseManagementCaseCreateField
                  key={field}
                  field={field}
                  value={fieldValues[field] || ""}
                  isSelected={field === focusedField}
                  isFilled={!!fieldValues[field]?.trim()}
                  disabled={loading}
                  onChange={(value) => onFieldValuesChange({ ...fieldValues, [field]: value })}
                  onFocus={() => {
                    onFocusedFieldChange(field);
                    onShowAllPreviewsChange(false);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Resizable Separation Line */}
      {(focusedField || showAllPreviews) && isLgScreen && (
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            onDraggingHeightChange(true);
          }}
          className={`h-[1px] cursor-row-resize z-20 select-none shrink-0 ${
            isDraggingHeight ? "bg-primary" : "bg-border hover:bg-primary/50"
          } transition-colors relative flex items-center`}
        >
          <div className="absolute inset-x-0 h-4 top-1/2 -translate-y-1/2 cursor-row-resize" />
        </div>
      )}

      {/* Bottom portion: Document Context drawer */}
      {(focusedField || showAllPreviews) && (
        <CaseManagementPreview
          isLgScreen={isLgScreen}
          bottomPercent={bottomPercent}
          showAllPreviews={showAllPreviews}
          onShowAllPreviewsChange={onShowAllPreviewsChange}
          focusedField={focusedField}
          onFocusedFieldChange={onFocusedFieldChange}
          associatedDocs={associatedDocs}
          fieldToDocsMap={fieldToDocsMap}
          expandedDocId={expandedDocId}
          onExpandedDocIdChange={onExpandedDocIdChange}
          onToggleDocContext={onToggleDocContext}
          onOpenTemplateFile={onOpenTemplateFile}
          docTemplates={docTemplates}
          loadingContext={loadingContext}
          previewError={previewError}
          docHtmlCache={docHtmlCache}
          templateFields={templateFields}
          fieldValues={fieldValues}
          onFieldClickFromPreview={onFieldClickFromPreview}
        />
      )}
    </div>
  );
}
