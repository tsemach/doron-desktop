import { useState } from "react";
import { Button } from "../../ui/button";
import FileTypeIcon from "@/components/ui/FileTypeIcon";
import { DocTemplate } from "../CaseManagementTypes";

interface TemplateCreateFormProps {
  docTemplates: DocTemplate[];
  onSave: (name: string, fields: string[], docTemplateIds: number[]) => Promise<void>;
  onCancel: () => void;
}

export default function CaseTemplateCreateForm({
  docTemplates,
  onSave,
  onCancel,
}: TemplateCreateFormProps) {
  const [templateName, setTemplateName] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const [newField, setNewField] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<number[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function handleAddField(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const cleanField = newField.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (cleanField && !fields.includes(cleanField)) {
      setFields([...fields, cleanField]);
      setNewField("");
    }
  }

  function handleRemoveField(fieldToRemove: string) {
    setFields(fields.filter((f) => f !== fieldToRemove));
  }

  function handleToggleDoc(docId: number) {
    setSelectedDocs((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  }

  async function handleFormSubmit() {
    if (!templateName.trim()) {
      alert("Please enter a template name.");
      return;
    }
    setSubmitting(true);
    try {
      await onSave(templateName.trim(), fields, selectedDocs);
    } finally {
      setSubmitting(false);
    }
  }

  function getDocFieldCount(doc: DocTemplate): number {
    try {
      return JSON.parse(doc.fields_found).length;
    } catch {
      return 0;
    }
  }

  return (
    <div className="space-y-6 max-w-3xl animate-in slide-in-from-bottom duration-300">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h3 className="text-lg font-bold text-foreground">Create New Case Template</h3>
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-7 text-xs">
          ✕ Cancel
        </Button>
      </div>

      <div className="space-y-5">
        {/* Template Name */}
        <div className="space-y-1.5">
          <label htmlFor="templateName" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Case Template Name
          </label>
          <input
            id="templateName"
            type="text"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g. Selling a House, Tenant Eviction, Lawsuit File"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
            disabled={submitting}
          />
        </div>

        {/* Fields Editor */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
            Required Fields / Dynamic Variables
          </label>
          <p className="text-xs text-muted-foreground">
            Define the field variables required for this case template.
          </p>

          {/* Tag Badges Box */}
          <div className="flex flex-wrap gap-1.5 p-3 rounded-md border border-input bg-muted/20 min-h-[50px]">
            {fields.length === 0 ? (
              <span className="text-xs text-muted-foreground italic my-auto">No variables added yet.</span>
            ) : (
              fields.map((field) => (
                <span
                  key={field}
                  className="inline-flex items-center gap-1 text-xs font-mono bg-secondary text-secondary-foreground rounded-full px-2.5 py-0.5 border border-border"
                >
                  {field}
                  <button
                    type="button"
                    onClick={() => handleRemoveField(field)}
                    className="text-muted-foreground hover:text-destructive focus:outline-none ml-0.5"
                    disabled={submitting}
                  >
                    ✕
                  </button>
                </span>
              ))
            )}
          </div>

          {/* Add Field Inputs */}
          <form onSubmit={handleAddField} className="flex gap-2">
            <input
              type="text"
              value={newField}
              onChange={(e) => setNewField(e.target.value)}
              placeholder="Type field name (e.g. property_price) and press Enter"
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring transition-all"
              disabled={submitting}
            />
            <Button type="submit" variant="secondary" size="sm" className="h-8" disabled={submitting}>
              Add Field
            </Button>
          </form>
        </div>

        {/* Document Association Checkbox Grid */}
        <div className="space-y-2.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
            Include Document Templates
          </label>

          {docTemplates.length === 0 ? (
            <div className="rounded-md border border-dashed border-input p-6 text-center text-xs text-muted-foreground">
              No document templates found. Go to <strong>Documents Management &rarr; Templates</strong> to upload doc templates first.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-input rounded-md p-3 bg-muted/10">
              {docTemplates.map((doc) => {
                const isChecked = selectedDocs.includes(doc.id);
                const hasTitle = !!doc.title;
                const primaryText = hasTitle ? doc.title : doc.file_name;
                const secondaryText = hasTitle ? doc.file_name : null;
                return (
                  <label
                    key={doc.id}
                    className={`flex items-start gap-2.5 p-2 rounded-md border cursor-pointer hover:bg-muted/40 transition-all ${isChecked ? "bg-primary/5 border-primary/30" : "border-border bg-card"
                      }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleDoc(doc.id)}
                      className="mt-0.5 rounded text-primary focus:ring-primary h-3.5 w-3.5"
                      disabled={submitting}
                    />
                    <div className="min-w-0">
                      <span className="block text-xs font-medium text-foreground truncate" title={primaryText || ""}>
                        {primaryText}
                      </span>
                      {secondaryText && (
                        <span className="block text-[10px] text-muted-foreground truncate" title={secondaryText}>
                          {secondaryText}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground font-mono">
                        <FileTypeIcon ext={doc.file_ext} size="sm" />
                        <span>{getDocFieldCount(doc)} fields</span>
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={handleFormSubmit} disabled={submitting}>
          {submitting ? "Creating..." : "Create Template"}
        </Button>
      </div>
    </div>
  );
}
