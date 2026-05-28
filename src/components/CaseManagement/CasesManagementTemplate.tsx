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

  // Split-pane selection state
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Form State
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

      // Auto-select first template if list is not empty and none is selected
      if (caseRows.length > 0 && selectedTemplateId === null) {
        setSelectedTemplateId(caseRows[0].id);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load templates from database.");
    } finally {
      setLoading(false);
    }
  }

  // Find active template object
  const activeTemplate = caseTemplates.find((ct) => ct.id === selectedTemplateId) || null;

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
    setIsEditing(false);
    setIsCreating(true);
  }

  // Start editing active template
  function handleStartEdit() {
    if (!activeTemplate) return;
    setTemplateName(activeTemplate.name);
    setSelectedDocs(activeTemplate.doc_template_ids);
    try {
      setFields(JSON.parse(activeTemplate.fields));
    } catch {
      setFields([]);
    }
    setIsCreating(false);
    setIsEditing(true);
  }

  // Handle Save (Create or Update)
  async function handleSave() {
    if (!templateName.trim()) {
      alert("Please enter a template name.");
      return;
    }

    try {
      if (isEditing && selectedTemplateId !== null) {
        // Edit Mode
        await invoke("update_case_template", {
          id: selectedTemplateId,
          name: templateName.trim(),
          fields,
          docTemplateIds: selectedDocs,
        });
        setIsEditing(false);
      } else if (isCreating) {
        // Create Mode
        const newId = await invoke<number>("create_case_template", {
          name: templateName.trim(),
          fields,
          docTemplateIds: selectedDocs,
        });
        setSelectedTemplateId(newId);
        setIsCreating(false);
      }
      await loadData();
    } catch (err) {
      alert(`Error saving case template: ${err}`);
    }
  }

  // Cancel form
  function handleCancel() {
    setIsEditing(false);
    setIsCreating(false);
  }

  // Handle Delete
  async function handleDelete() {
    if (!selectedTemplateId) return;
    if (!confirm("Are you sure you want to delete this case template?")) return;
    try {
      await invoke("delete_case_template", { id: selectedTemplateId });
      // Reset selection
      const remaining = caseTemplates.filter((ct) => ct.id !== selectedTemplateId);
      setSelectedTemplateId(remaining.length > 0 ? remaining[0].id : null);
      setIsEditing(false);
      setIsCreating(false);
      await loadData();
    } catch (err) {
      alert(`Error deleting case template: ${err}`);
    }
  }

  // Select a template
  function handleSelectTemplate(id: number) {
    setSelectedTemplateId(id);
    setIsEditing(false);
    setIsCreating(false);
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

  // Map doc ID to file ext helper
  function getDocExt(id: number): string {
    const doc = docTemplates.find((d) => d.id === id);
    return doc ? doc.file_ext : "";
  }

  // Map doc ID to fields count helper
  function getDocFieldCount(id: number): number {
    const doc = docTemplates.find((d) => d.id === id);
    if (!doc) return 0;
    try {
      return JSON.parse(doc.fields_found).length;
    } catch {
      return 0;
    }
  }

  return (
    <main className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
      {/* Top Header */}
      <div className="flex items-center justify-between p-6 border-b border-border bg-card shrink-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Case Templates</h2>
          <p className="text-sm text-muted-foreground">
            Configure case workflows by grouping document templates and defining required field variables.
          </p>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive shrink-0">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground space-y-2">
          <div className="animate-spin text-primary text-2xl font-bold">⟳</div>
          <p className="text-sm">Loading templates...</p>
        </div>
      ) : (
        /* Split-pane Workspace */
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Column: Templates List */}
          <aside className="w-1/3 border-r border-border flex flex-col bg-muted/10 shrink-0 overflow-y-auto">
            <div className="p-4 border-b border-border flex items-center justify-between bg-card shrink-0">
              <span className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                Templates ({caseTemplates.length})
              </span>
              <Button size="sm" onClick={handleStartCreate} className="h-7 px-2.5 text-xs">
                + New Template
              </Button>
            </div>
            
            <div className="flex-1 overflow-y-auto divide-y divide-border">
              {caseTemplates.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground italic">
                  No templates created. Click "+ New Template" to add one.
                </div>
              ) : (
                caseTemplates.map((ct) => {
                  const isSelected = ct.id === selectedTemplateId && !isCreating;
                  let docCount = ct.doc_template_ids.length;
                  let fieldCount = 0;
                  try {
                    fieldCount = JSON.parse(ct.fields).length;
                  } catch {}

                  return (
                    <div
                      key={ct.id}
                      onClick={() => handleSelectTemplate(ct.id)}
                      className={`p-4 cursor-pointer hover:bg-muted/40 transition-all border-l-4 ${
                        isSelected
                          ? "bg-accent/40 border-primary"
                          : "border-transparent bg-transparent"
                      }`}
                    >
                      <h4 className="font-semibold text-sm text-foreground truncate" title={ct.name}>
                        {ct.name}
                      </h4>
                      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground font-mono">
                        <span>
                          {docCount} {docCount === 1 ? "doc" : "docs"} &bull; {fieldCount} {fieldCount === 1 ? "field" : "fields"}
                        </span>
                        <span>{formatDate(ct.created_at)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* Right Column: Detailed View / Forms (2/3 width) */}
          <section className="flex-1 flex flex-col overflow-y-auto bg-background p-6">
            {isCreating || isEditing ? (
              /* CREATE / EDIT FORM VIEW */
              <div className="space-y-6 max-w-3xl">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="text-lg font-bold text-foreground">
                    {isCreating ? "Create New Case Template" : `Edit Case Template: ${templateName}`}
                  </h3>
                  <Button variant="ghost" size="sm" onClick={handleCancel} className="h-7 text-xs">
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
                    />
                  </div>

                  {/* Fields Editor */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      Required Fields / Dynamic Variables
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Define the exact field variables (e.g. <code>seller_name</code>, <code>price</code>) required for this case template.
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
                      />
                      <Button type="submit" variant="secondary" size="sm" className="h-8">
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[200px] overflow-y-auto border border-input rounded-md p-3 bg-muted/10">
                        {docTemplates.map((doc) => {
                          const isChecked = selectedDocs.includes(doc.id);
                          return (
                            <label
                              key={doc.id}
                              className={`flex items-start gap-2.5 p-2 rounded-md border cursor-pointer hover:bg-muted/40 transition-all ${
                                isChecked ? "bg-primary/5 border-primary/30" : "border-border bg-card"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleDoc(doc.id)}
                                className="mt-0.5 rounded text-primary focus:ring-primary h-3.5 w-3.5"
                              />
                              <div className="min-w-0">
                                <span className="block text-xs font-medium text-foreground truncate" title={doc.file_name}>
                                  {doc.file_name}
                                </span>
                                <span className="inline-flex items-center gap-1.5 mt-0.5 text-[10px] text-muted-foreground font-mono">
                                  <span className="uppercase text-[8px] bg-muted px-1 py-0.2 rounded border">
                                    {doc.file_ext}
                                  </span>
                                  <span>{getDocFieldCount(doc.id)} fields</span>
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
                  <Button variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave}>
                    {isEditing ? "Save Changes" : "Create Template"}
                  </Button>
                </div>
              </div>
            ) : activeTemplate ? (
              /* DETAILED DETAIL VIEW */
              <div className="space-y-6 animate-in fade-in duration-300">
                
                {/* Detail View Title and Actions */}
                <div className="flex items-start justify-between border-b border-border pb-4">
                  <div>
                    <h3 className="text-xl font-bold text-foreground tracking-tight">{activeTemplate.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Created on {formatDate(activeTemplate.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleStartEdit}>
                      Edit Template
                    </Button>
                    <button
                      onClick={handleDelete}
                      className="text-xs font-semibold text-muted-foreground hover:text-destructive hover:underline px-3 py-1.5 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Left/Right Split in Detail Column */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  
                  {/* Documents Section */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b pb-1">
                      Document Templates ({activeTemplate.doc_template_ids.length})
                    </h4>
                    {activeTemplate.doc_template_ids.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No document templates associated with this case template.</p>
                    ) : (
                      <div className="space-y-2">
                        {activeTemplate.doc_template_ids.map((id) => (
                          <div
                            key={id}
                            className="flex items-center justify-between p-3 rounded-md border border-border bg-muted/20"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-foreground truncate" title={getDocName(id)}>
                                {getDocName(id)}
                              </span>
                              <span className="inline-flex items-center gap-2 text-[10px] text-muted-foreground font-mono mt-0.5">
                                <span className="uppercase text-[8px] bg-muted px-1.5 py-0.2 rounded border">
                                  {getDocExt(id)}
                                </span>
                                <span>{getDocFieldCount(id)} fields found</span>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Required Fields Section */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b pb-1">
                      Required Fields ({JSON.parse(activeTemplate.fields).length})
                    </h4>
                    {(() => {
                      let fieldArray: string[] = [];
                      try {
                        fieldArray = JSON.parse(activeTemplate.fields);
                      } catch {}

                      if (fieldArray.length === 0) {
                        return <p className="text-xs text-muted-foreground italic">No required fields defined.</p>;
                      }

                      return (
                        <div className="flex flex-wrap gap-1.5">
                          {fieldArray.map((field) => (
                            <span
                              key={field}
                              className="text-xs font-mono bg-secondary text-secondary-foreground px-2.5 py-1 rounded-full border border-border"
                            >
                              {field}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                </div>
              </div>
            ) : (
              /* EMPTY STATE */
              <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground space-y-4 py-20">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="18" x="3" y="3" rx="2" />
                    <path d="M7 8h10" />
                    <path d="M7 12h10" />
                    <path d="M7 16h10" />
                  </svg>
                </div>
                <div className="text-center space-y-1">
                  <h3 className="text-base font-semibold text-foreground">Select a Case Template</h3>
                  <p className="text-sm max-w-sm">
                    Select a case template from the list on the left to see its associated document templates and dynamic variables.
                  </p>
                </div>
              </div>
            )}
          </section>

        </div>
      )}
    </main>
  );
}
