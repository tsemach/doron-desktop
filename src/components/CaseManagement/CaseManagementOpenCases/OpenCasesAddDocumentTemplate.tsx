import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";

import { DocTemplate } from "../CaseManagementTypes";

interface OpenCasesAddDocumentTemplateProps {
  caseId: number;
  caseFolder: string;
  onSave: () => void;
  onCancel: () => void;
}

export default function OpenCasesAddDocumentTemplate({
  caseId,
  caseFolder,
  onSave,
  onCancel,
}: OpenCasesAddDocumentTemplateProps) {
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persistence States
  const [savedCaseFields, setSavedCaseFields] = useState<Record<string, string>>({});

  // Option 1: Template Selection States
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [templateFields, setTemplateFields] = useState<string[]>([]);
  const [isProcessingTemplate, setIsProcessingTemplate] = useState(false);

  // Common Action States
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadTemplates();
    loadCaseFields();
  }, [caseId]);

  // Dynamically sync form values when saved fields are loaded
  useEffect(() => {
    if (selectedTemplateId) {
      const tpl = templates.find((t) => String(t.id) === selectedTemplateId);
      if (tpl) {
        try {
          const fields = JSON.parse(tpl.fields_found || "[]");
          setFieldValues((prev) => {
            const updated = { ...prev };
            fields.forEach((f: string) => {
              // Pre-fill only if not already entered by the user in this session,
              // or fallback if the input is currently empty
              if (!updated[f] && savedCaseFields[f]) {
                updated[f] = savedCaseFields[f];
              }
            });
            return updated;
          });
        } catch { }
      }
    }
  }, [savedCaseFields, selectedTemplateId, templates]);

  async function loadCaseFields() {
    try {
      const fields = await invoke<Record<string, string>>("get_case_fields", { caseId });
      setSavedCaseFields(fields || {});
    } catch (e) {
      console.error("Failed to load case fields:", e);
    }
  }

  async function loadTemplates() {
    setLoadingTemplates(true);
    setError(null);
    try {
      const rows = await invoke<DocTemplate[]>("list_templates");
      setTemplates(rows);
      if (rows.length > 0) {
        // Set first template as default selected
        handleSelectTemplate(rows[0]);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load templates: " + err);
    } finally {
      setLoadingTemplates(false);
    }
  }

  function handleSelectTemplate(tpl: DocTemplate) {
    setSelectedTemplateId(String(tpl.id));
    try {
      const fields = JSON.parse(tpl.fields_found || "[]");
      setTemplateFields(fields);
      const initialVals: Record<string, string> = {};
      fields.forEach((f: string) => {
        // Pre-fill from already loaded case fields if available, otherwise empty
        initialVals[f] = savedCaseFields[f] || "";
      });
      setFieldValues(initialVals);
    } catch (e) {
      setTemplateFields([]);
      setFieldValues({});
    }
  }

  // Handle template selection dropdown change
  function handleDropdownChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    setSelectedTemplateId(id);
    const found = templates.find((t) => String(t.id) === id);
    if (found) {
      handleSelectTemplate(found);
    } else {
      setTemplateFields([]);
      setFieldValues({});
    }
  }

  // Browse marked template file from disk (*.marked.docs / *.marked.pdf / *.marked.docx / etc.)
  async function handleBrowseMarkedTemplate() {
    setError(null);
    try {
      const selected = await open({
        multiple: false,
        title: "Select Marked Template File (*.marked.docx, *.marked.pdf)",
        filters: [
          {
            name: "Marked Templates",
            extensions: ["marked.docx", "marked.pdf", "marked.doc", "marked.txt"]
          },
          {
            name: "All Documents",
            extensions: ["docx", "doc", "pdf", "txt", "xlsx", "xls"]
          }
        ]
      });

      if (!selected || typeof selected !== "string") return;

      // Validate that it has .marked in the filename
      const filename = selected.split(/[\\/]/).pop() || "";
      if (!filename.toLowerCase().includes(".marked.")) {
        if (!confirm("This file name does not contain '.marked' in its suffix. Templates are typically named like 'document.marked.docx'. Do you still want to proceed?")) {
          return;
        }
      }

      setIsProcessingTemplate(true);
      // Process template using Tauri command - this copies it to templates folder & registers in DB
      const result = await invoke<any>("process_template", {
        filePath: selected,
        title: filename.replace(".marked", "")
      });

      // Reload templates database list
      const rows = await invoke<DocTemplate[]>("list_templates");
      setTemplates(rows);

      // Find the newly registered template
      const newlyAdded = rows.find((r) => r.id === result.id);
      if (newlyAdded) {
        handleSelectTemplate(newlyAdded);
      } else {
        setSelectedTemplateId(String(result.id));
        setTemplateFields(result.fields_found || []);
        const initialVals: Record<string, string> = {};
        (result.fields_found || []).forEach((f: string) => {
          initialVals[f] = savedCaseFields[f] || "";
        });
        setFieldValues(initialVals);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to process template file: " + err);
    } finally {
      setIsProcessingTemplate(false);
    }
  }

  // Add template-based document to case
  async function handleAddTemplateDoc() {
    if (!selectedTemplateId) {
      setError("Please select a document template.");
      return;
    }
    const template = templates.find((t) => String(t.id) === selectedTemplateId);
    if (!template) {
      setError("Selected template not found.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      // Destination file name is the original template file name, generated inside the case folder
      const outPath = `${caseFolder}/${template.file_name}`;

      // 1. Generate document
      await invoke("generate_document_from_template", {
        templateId: template.id,
        fieldValues,
        outputPath: outPath,
      });

      // 2. Persist the field values for this case
      await invoke("save_case_fields", {
        caseId,
        fields: fieldValues,
      });

      onSave();
    } catch (err) {
      console.error(err);
      setError("Failed to generate document: " + err);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex-grow flex flex-col min-h-0">
      {/* Content Body */}
      <div className="flex-1 flex flex-col min-h-0 p-6 overflow-y-auto">
        {error && (
          <div className="mb-4 rounded-md border border-destructive bg-destructive/10 px-4 py-2.5 text-xs text-destructive shrink-0">
            {error}
          </div>
        )}

        <div className="flex-grow flex flex-col min-h-0 space-y-4">
          <div className="flex gap-2 items-end shrink-0">
            <div className="flex-grow space-y-1.5">
              <label htmlFor="template-select" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Select Template
              </label>
              <select
                id="template-select"
                value={selectedTemplateId}
                onChange={handleDropdownChange}
                disabled={loadingTemplates || isProcessingTemplate || isSubmitting}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-all h-[38px]"
              >
                {loadingTemplates ? (
                  <option>Loading templates...</option>
                ) : templates.length === 0 ? (
                  <option value="">No templates registered in database</option>
                ) : (
                  templates.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.title || t.file_name} (.{t.file_ext})
                    </option>
                  ))
                )}
              </select>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={handleBrowseMarkedTemplate}
              disabled={isProcessingTemplate || isSubmitting}
              className="h-[38px] px-3 shrink-0 whitespace-nowrap text-xs font-medium"
            >
              {isProcessingTemplate ? "Processing..." : "Browse disk..."}
            </Button>
          </div>

          {/* Fields Inputs section */}
          <div className="flex-grow flex flex-col min-h-0 border border-border/80 bg-background/50 rounded-lg p-4 space-y-3">
            <div className="shrink-0 pb-1 border-b border-border/60">
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                Template Variables / Placeholders
              </h4>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Unfilled fields will remain as placeholders in the final document.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              {templateFields.length === 0 ? (
                <div className="flex items-center justify-center h-full text-center text-xs text-muted-foreground/80 py-8">
                  No placeholder variables found in this template.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-1">
                  {templateFields.map((field) => (
                    <div key={field} className="space-y-1">
                      <label
                        htmlFor={`field-input-${field}`}
                        className="text-xs font-mono font-medium text-muted-foreground truncate block"
                        title={field}
                      >
                        {field}
                      </label>
                      <input
                        id={`field-input-${field}`}
                        type="text"
                        placeholder="Value..."
                        value={fieldValues[field] || ""}
                        onChange={(e) =>
                          setFieldValues({
                            ...fieldValues,
                            [field]: e.target.value,
                          })
                        }
                        disabled={isSubmitting}
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring transition-all font-mono"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-6 py-4 border-t border-border mt-auto flex justify-end gap-2 shrink-0 select-none">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleAddTemplateDoc}
          disabled={isSubmitting || !selectedTemplateId || isProcessingTemplate}
        >
          {isSubmitting ? "Generating..." : "Generate & Add to Case"}
        </Button>
      </div>
    </div>
  );
}
