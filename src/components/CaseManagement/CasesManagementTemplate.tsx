import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/button";

interface DocTemplate {
  id: number;
  file_name: string;
  file_ext: string;
  fields_found: string; // JSON string of array
  uploaded_at: string;
}

interface CaseTemplate {
  id: number;
  name: string;
  fields: string; // JSON string of array
  created_at: string;
  doc_template_ids: number[];
}

export default function CasesManagementTemplate() {
  const [caseTemplates, setCaseTemplates] = useState<CaseTemplate[]>([]);
  const [docTemplates, setDocTemplates] = useState<DocTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const [newField, setNewField] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<number[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [caseRows, docRows] = await Promise.all([
        invoke<CaseTemplate[]>("list_case_templates"),
        invoke<DocTemplate[]>("list_templates"),
      ]);
      setCaseTemplates(caseRows);
      setDocTemplates(docRows);
    } catch (err) {
      console.error(err);
      setError("Failed to load templates from database.");
    } finally {
      setLoading(false);
    }
  }

  // Handle Field Tag additions
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

  // Handle doc template checkbox toggle
  function handleToggleDoc(docId: number) {
    setSelectedDocs((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  }

  // Start creating new template
  function handleStartCreate() {
    setTemplateName("");
    setFields([]);
    setSelectedDocs([]);
    setEditingId(null);
    setIsEditing(true);
  }

  // Start editing existing template
  function handleStartEdit(ct: CaseTemplate) {
    setTemplateName(ct.name);
    setEditingId(ct.id);
    setSelectedDocs(ct.doc_template_ids);
    try {
      setFields(JSON.parse(ct.fields));
    } catch {
      setFields([]);
    }
    setIsEditing(true);
  }

  // Handle Save
  async function handleSave() {
    if (!templateName.trim()) {
      alert("Please enter a template name.");
      return;
    }

    try {
      if (editingId !== null) {
        // Edit Mode
        await invoke("update_case_template", {
          id: editingId,
          name: templateName.trim(),
          fields,
          docTemplateIds: selectedDocs,
        });
      } else {
        // Create Mode
        await invoke("create_case_template", {
          name: templateName.trim(),
          fields,
          docTemplateIds: selectedDocs,
        });
      }
      setIsEditing(false);
      await loadData();
    } catch (err) {
      alert(`Error saving case template: ${err}`);
    }
  }

  // Handle Delete
  async function handleDelete(id: number) {
    if (!confirm("Are you sure you want to delete this case template?")) return;
    try {
      await invoke("delete_case_template", { id });
      await loadData();
    } catch (err) {
      alert(`Error deleting case template: ${err}`);
    }
  }

  // Get human-friendly date
  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso.slice(0, 10);
    }
  }

  // Map doc ID to file name helper
  function getDocName(id: number): string {
    const doc = docTemplates.find((d) => d.id === id);
    return doc ? doc.file_name : `Unknown Doc (${id})`;
  }

  return (
    <main className="flex-1 overflow-auto p-6 bg-background">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Case Templates</h2>
          <p className="text-sm text-muted-foreground">
            Group document templates and configure custom field variables required for new cases.
          </p>
        </div>
        {!isEditing && (
          <Button onClick={handleStartCreate} className="shadow-sm">
            + Create Case Template
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive animate-in fade-in duration-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-2">
          <div className="animate-spin text-primary text-2xl font-bold">⟳</div>
          <p className="text-sm">Loading templates...</p>
        </div>
      ) : isEditing ? (
        /* Edit / Create Form */
        <div className="max-w-3xl rounded-lg border border-border bg-card shadow-sm p-6 space-y-6 animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-lg font-semibold text-foreground">
              {editingId !== null ? "Edit Case Template" : "New Case Template"}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
              ✕ Cancel
            </Button>
          </div>

          <div className="space-y-4">
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
                placeholder="e.g. Selling a House, Tenant Dispute, Employment Agreement"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
              />
            </div>

            {/* Dynamic Fields Editor */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Fields / Variables
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Define the field variables (e.g. <code>buyer_name</code>) that the user must enter when opening a case from this template.
              </p>

              {/* Tags Display */}
              <div className="flex flex-wrap gap-1.5 p-3 rounded-md border border-input bg-muted/20 min-h-[50px] mb-2">
                {fields.length === 0 ? (
                  <span className="text-xs text-muted-foreground italic my-auto">No custom fields defined yet.</span>
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
                      >
                        ✕
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Tag Input */}
              <form onSubmit={handleAddField} className="flex gap-2">
                <input
                  type="text"
                  value={newField}
                  onChange={(e) => setNewField(e.target.value)}
                  placeholder="Type field name (e.g. property_price) and press Enter"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                />
                <Button type="submit" variant="secondary" size="sm">
                  Add Field
                </Button>
              </form>
            </div>

            {/* Document Templates Selector */}
            <div className="space-y-2.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                Associated Document Templates
              </label>
              <p className="text-xs text-muted-foreground">
                Select which doc templates should be bundled into this case template.
              </p>

              {docTemplates.length === 0 ? (
                <div className="rounded-md border border-dashed border-input p-6 text-center text-sm text-muted-foreground">
                  No document templates found. Go to <strong>Documents Management &rarr; Templates</strong> to upload document templates (docx, pdf, etc.) first.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto border border-input rounded-md p-3 bg-muted/10">
                  {docTemplates.map((doc) => {
                    const isChecked = selectedDocs.includes(doc.id);
                    let placeholderCount = 0;
                    try {
                      placeholderCount = JSON.parse(doc.fields_found).length;
                    } catch {}

                    return (
                      <label
                        key={doc.id}
                        className={`flex items-start gap-3 p-2.5 rounded-md border cursor-pointer hover:bg-muted/40 transition-all ${
                          isChecked ? "bg-primary/5 border-primary/30" : "border-border bg-card"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleDoc(doc.id)}
                          className="mt-1 rounded text-primary focus:ring-primary h-4 w-4"
                        />
                        <div className="min-w-0">
                          <span className="block text-sm font-medium text-foreground truncate" title={doc.file_name}>
                            {doc.file_name}
                          </span>
                          <span className="inline-flex items-center gap-2 mt-0.5 text-xs text-muted-foreground font-mono">
                            <span className="uppercase text-[9px] bg-muted px-1.5 py-0.2 rounded border">
                              {doc.file_ext}
                            </span>
                            <span>{placeholderCount} placeholders</span>
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
            <Button variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingId !== null ? "Save Changes" : "Create Template"}
            </Button>
          </div>
        </div>
      ) : caseTemplates.length === 0 ? (
        /* Empty State */
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center max-w-xl mx-auto mt-12 animate-in fade-in duration-300">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4 text-muted-foreground">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
              <path d="M6 6h10" />
              <path d="M6 10h10" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-foreground">No Case Templates</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-6">
            Get started by creating your first case template. A case template groups multiple documents (like contracts, letters) and maps out fields required to create them.
          </p>
          <Button onClick={handleStartCreate}>+ Create First Case Template</Button>
        </div>
      ) : (
        /* Case Templates List */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in duration-300">
          {caseTemplates.map((ct) => {
            let fieldArray: string[] = [];
            try {
              fieldArray = JSON.parse(ct.fields);
            } catch {}

            return (
              <div
                key={ct.id}
                className="flex flex-col rounded-lg border border-border bg-card hover:shadow-md hover:border-primary/20 transition-all duration-200"
              >
                {/* Body */}
                <div className="flex-1 p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-lg font-semibold text-foreground tracking-tight leading-none truncate" title={ct.name}>
                      {ct.name}
                    </h3>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap bg-muted px-2 py-0.5 rounded-full">
                      {formatDate(ct.created_at)}
                    </span>
                  </div>

                  {/* Associated Documents Section */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Document Templates ({ct.doc_template_ids.length})
                    </span>
                    {ct.doc_template_ids.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No document templates associated.</p>
                    ) : (
                      <ul className="space-y-1 text-xs text-foreground max-h-[80px] overflow-y-auto pr-1">
                        {ct.doc_template_ids.map((id) => (
                          <li key={id} className="flex items-center gap-1.5 truncate text-muted-foreground" title={getDocName(id)}>
                            <span className="text-[8px] text-primary/75">&#9679;</span>
                            <span className="truncate">{getDocName(id)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Required Fields Section */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Required Fields ({fieldArray.length})
                    </span>
                    {fieldArray.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No required fields defined.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1 max-h-[60px] overflow-y-auto pr-1">
                        {fieldArray.map((field) => (
                          <span
                            key={field}
                            className="text-[10px] font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded border border-border"
                          >
                            {field}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-between border-t border-border px-5 py-3.5 bg-muted/10 rounded-b-lg">
                  <button
                    onClick={() => handleDelete(ct.id)}
                    className="text-xs font-semibold text-muted-foreground hover:text-destructive hover:underline transition-colors"
                  >
                    Delete
                  </button>
                  <Button variant="outline" size="sm" onClick={() => handleStartEdit(ct)}>
                    Edit / Manage
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
