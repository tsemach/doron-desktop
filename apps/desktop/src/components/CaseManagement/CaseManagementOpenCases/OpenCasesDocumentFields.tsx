import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../../ui/button";
import { CaseFile, DocTemplate } from "../CaseManagementTypes";
import DocumentPlaceholderPreview from "../DocumentPlaceholderPreview";
import mammoth from "mammoth";

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
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [showOnlyEmpty, setShowOnlyEmpty] = useState(false);
  const [initiallyEmptyFields, setInitiallyEmptyFields] = useState<string[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          docFields = JSON.parse(match.fields_found) as string[];
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
        setFieldValues(initialValues);
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

  const filteredFields = fields.filter((field) => {
    const matchesSearch = field.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (showOnlyEmpty) {
      return initiallyEmptyFields.includes(field);
    }

    return true;
  });

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
      <div className="flex flex-col min-h-0 bg-card border border-border rounded-xl p-4 shadow-xs space-y-3 flex-1">
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
                <div key={field} className="space-y-0.5">
                  <label
                    htmlFor={`field-${field}`}
                    className="text-[10px] font-mono font-medium text-muted-foreground truncate block"
                    title={field}
                  >
                    {field}
                  </label>
                  <input
                    id={`field-${field}`}
                    type="text"
                    placeholder="Value..."
                    value={editedValues[field] || ""}
                    onChange={(e) =>
                      setEditedValues({ ...editedValues, [field]: e.target.value })
                    }
                    onFocus={() => setFocusedField(field)}
                    className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring transition-all font-mono"
                    disabled={saving}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Live Preview Box */}
        {docHtml && (
          <div className="flex flex-col min-h-0 pt-3 border-t border-border/60">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 shrink-0">
              Live Preview
            </span>
            <DocumentPlaceholderPreview
              html={docHtml}
              fields={fields}
              fieldValues={editedValues}
              focusedField={focusedField}
              className="bg-background/80 dark:bg-background/20 p-3 rounded-lg border border-border/40 overflow-y-auto max-h-[220px] min-h-[160px] relative select-text"
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
