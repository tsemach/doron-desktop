import { useState, useEffect, useMemo, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../../ui/button";
import { CaseFile, DocTemplate } from "../CaseManagementTypes";
import DocumentPlaceholderPreview from "../DocumentPlaceholderPreview";
import CaseManagementCaseCreateField from "../CaseManagementCaseCreateField";
import mammoth from "mammoth";
import { useRowFields } from "@/hooks/useRowFields";

interface OpenCasesDocumentFieldsProps {
  selectedDocument: CaseFile;
  caseId: number;
  onSaved: () => void;
  onCancel: () => void;
}

export default function OpenCasesDocumentFields({
  selectedDocument,
  caseId,
  onSaved,
  onCancel,
}: OpenCasesDocumentFieldsProps) {
  const [fields, setFields] = useState<string[]>([]);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [showOnlyEmpty, setShowOnlyEmpty] = useState(false);
  const [initiallyEmptyFields, setInitiallyEmptyFields] = useState<string[]>([]);
  
  const [previewHeight, setPreviewHeight] = useState(220);
  const [isDragging, setIsDragging] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle live preview panel resizing
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.getElementById("document-fields-container");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const height = rect.bottom - e.clientY - 60; // offset for the bottom action buttons height
      const clamped = Math.max(100, Math.min(600, height));
      setPreviewHeight(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Reset row selection when selected document changes
  useEffect(() => {
    setSelectedRow(null);
  }, [selectedDocument.name]);

  useEffect(() => {
    let active = true;
    async function loadData() {
      setLoading(true);
      setError(null);
      setShowOnlyEmpty(false);
      setInitiallyEmptyFields([]);
      try {
        // 1. Fetch templates to match filename
        const templates = await invoke<DocTemplate[]>("list_templates");
        const match = templates.find(
          (t) => t.file_name.toLowerCase() === selectedDocument.name.toLowerCase()
        );

        if (!match) {
          throw new Error("No template found matching this document filename.");
        }

        // 2. Parse document fields
        let docFields: string[] = [];
        try {
          const parsed = JSON.parse(match.fields_found);
          docFields = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          docFields = [];
        }
        
        if (!active) return;
        setFields(docFields);

        // 3. Load case fields values
        const currentCaseFields = await invoke<Record<string, string>>("get_case_fields", { caseId });
        
        if (!active) return;
        
        // Filter and merge case fields values for this document
        const initialValues: Record<string, string> = {};
        docFields.forEach((field) => {
          initialValues[field] = currentCaseFields[field] || "";
        });
        setEditedValues(initialValues);

        // 4. Load full HTML of marked template
        const ext = match.file_ext ? match.file_ext.toLowerCase() : match.file_name.split('.').pop()?.toLowerCase() || "";
        let htmlContent = "";

        if (ext === "docx") {
          const bytes = await invoke<number[]>("read_file_bytes", { path: match.marked_path });
          const arrayBuffer = new Uint8Array(bytes).buffer;
          const result = await mammoth.convertToHtml({ arrayBuffer });
          htmlContent = result.value;
        } else if (ext === "txt" || ext === "json" || ext === "md") {
          const bytes = await invoke<number[]>("read_file_bytes", { path: match.marked_path });
          const text = new TextDecoder().decode(new Uint8Array(bytes));
          htmlContent = text.split('\n').map((line) => `<p>${line}</p>`).join('');
        } else {
          throw new Error(`Unsupported template preview format: ${ext}`);
        }

        if (!active) return;
        setDocHtml(htmlContent);

      } catch (err) {
        if (active) {
          console.error("Failed to load document fields / preview:", err);
          setError(String(err));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [selectedDocument.name, caseId]);

  // Handle Save
  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await invoke("save_case_document_fields", {
        caseId,
        fileName: selectedDocument.name,
        fields: editedValues,
      });
      onSaved();
    } catch (err) {
      console.error("Failed to save document fields:", err);
      setError("Failed to save fields: " + err);
    } finally {
      setSaving(false);
    }
  }

  const { uniqueRows, getFilteredFields } = useRowFields(fields);

  const filteredFields = useMemo(() => {
    return getFilteredFields(selectedRow, searchQuery, (field) => {
      if (showOnlyEmpty) {
        return initiallyEmptyFields.includes(field);
      }
      return true;
    });
  }, [getFilteredFields, selectedRow, searchQuery, showOnlyEmpty, initiallyEmptyFields]);

  // Clicking a placeholder in the live preview jumps the fields grid to that
  // field's input and focuses it, so the user can type a value right away.
  const handleFieldClickFromPreview = useCallback((field: string) => {
    const isHidden = !filteredFields.includes(field);
    if (isHidden) {
      setSearchQuery("");
      setSelectedRow(null);
      setShowOnlyEmpty(false);
      setInitiallyEmptyFields([]);
    }
    setFocusedField(field);

    // Wait for React to actually commit + paint the re-render (filter reset
    // and/or focused-field highlight) before the target input can be scrolled
    // to/focused — a double rAF reliably waits for the next painted frame.
    const focusInput = () => {
      const input = document.getElementById(`field-${field}`) as HTMLInputElement | null;
      if (!input) return;
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      input.focus({ preventScroll: true });
    };
    requestAnimationFrame(() => requestAnimationFrame(focusInput));
  }, [filteredFields]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 py-12 text-muted-foreground">
        <svg
          className="animate-spin h-8 w-8 text-primary mb-3"
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
        <p className="text-xs">Loading document fields & preview...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 flex flex-col justify-between flex-1">
        <div className="rounded-lg border border-destructive bg-destructive/10 p-4 text-xs text-destructive">
          <span className="font-semibold block mb-1">Error:</span>
          {error}
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Back to Preview
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background/30 p-4 space-y-4">
      {/* Fields Editing Section */}
      <div 
        id="document-fields-container"
        className="flex flex-col min-h-0 bg-card border border-border rounded-xl p-4 shadow-xs space-y-3 flex-1"
      >
        <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Document Fields ({selectedDocument.name})
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Modify the placeholders for this document. Unfilled fields will fall back to placeholders.
            </p>
          </div>
          
          {/* Controls: Toggle Empty & Search bar */}
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <Button
              type="button"
              variant={showOnlyEmpty ? "default" : "outline"}
              size="sm"
              onClick={() => {
                const nextState = !showOnlyEmpty;
                setShowOnlyEmpty(nextState);
                if (nextState) {
                  // Capture the fields that are empty at this exact moment
                  const empty = fields.filter(
                    (f) => !editedValues[f] || editedValues[f].trim() === ""
                  );
                  setInitiallyEmptyFields(empty);
                } else {
                  setInitiallyEmptyFields([]);
                }
              }}
              className="text-xs h-[30px] px-2.5 gap-1.5 flex items-center justify-center cursor-pointer select-none"
            >
              {showOnlyEmpty ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Showing Empty
                </>
              ) : (
                "Show Empty Only"
              )}
            </Button>

            {/* Row Select Dropdown (to the left of the search bar) */}
            {uniqueRows.length > 0 && (
              <div className="relative w-full sm:w-[120px] shrink-0 animate-in fade-in duration-200">
                <select
                  value={selectedRow ?? "all"}
                  onChange={(e) => setSelectedRow(e.target.value === "all" ? null : parseInt(e.target.value, 10))}
                  className="rounded-md border-0 bg-background pl-3 pr-8 rtl:pr-3 rtl:pl-8 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring h-[30px] w-full shadow-[0_0_0_1px_var(--border)] appearance-none cursor-pointer"
                >
                  <option value="all">All Rows</option>
                  {uniqueRows.map((row) => (
                    <option key={row} value={row}>
                      Row {row}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-2.5 rtl:left-2.5 rtl:right-auto flex items-center pointer-events-none text-muted-foreground">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>
            )}

            {/* Search bar */}
            <div className="relative w-full sm:w-[200px]">
              <input
                type="text"
                placeholder="Search fields..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring text-foreground font-mono"
              />
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>
          </div>
        </div>

        {/* Scrollable Fields Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {filteredFields.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground bg-muted/10 h-full flex items-center justify-center">
              {fields.length === 0
                ? "This document contains no template fields."
                : "No fields match your search query."}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-2.5 pb-2">
              {filteredFields.map((field) => (
                <CaseManagementCaseCreateField
                  key={field}
                  field={field}
                  value={editedValues[field] || ""}
                  isSelected={field === focusedField}
                  isFilled={!!editedValues[field]?.trim()}
                  disabled={saving}
                  onChange={(value) => setEditedValues({ ...editedValues, [field]: value })}
                  onFocus={() => setFocusedField(field)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Live Preview Box */}
        {docHtml && (
          <div className="flex flex-col min-h-0 relative select-none shrink-0">
            {/* Horizontal Resize Grab Handle */}
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              className={`h-[1px] cursor-row-resize z-20 shrink-0 ${
                isDragging ? "bg-primary" : "bg-border/60 hover:bg-primary/50"
              } transition-colors relative flex items-center justify-center`}
            >
              {/* grab handle indicator bar */}
              <div className={`absolute w-12 h-3.5 -top-1.75 flex items-center justify-center rounded-md border border-border bg-card shadow-xs cursor-row-resize ${
                isDragging ? "text-primary border-primary" : "text-muted-foreground"
              }`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m18 15-6 6-6-6" />
                  <path d="m6 9 6-6 6 6" />
                </svg>
              </div>
            </div>

            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-4 mb-2 shrink-0 select-none">
              Live Preview
            </span>
            <DocumentPlaceholderPreview
              html={docHtml}
              fields={fields}
              fieldValues={editedValues}
              focusedField={focusedField}
              onFieldClick={handleFieldClickFromPreview}
              style={{ height: `${previewHeight}px` }}
              className="bg-background/80 dark:bg-background/20 p-3 rounded-lg border border-border/40 overflow-y-auto relative select-text"
            />
          </div>
        )}

        {/* Bottom Actions */}
        <div className="flex justify-end gap-3 pt-3 border-t border-border shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving || fields.length === 0}
          >
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
