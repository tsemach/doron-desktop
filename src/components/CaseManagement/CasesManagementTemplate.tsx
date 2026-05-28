import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "../ui/button";

interface DocTemplate {
  id: number;
  file_name: string;
  file_ext: string;
  fields_found: string; // JSON string of array
  uploaded_at: string;
  title: string | null;
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
  const [isCreating, setIsCreating] = useState(false);

  // Creation Form State
  const [templateName, setTemplateName] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const [newField, setNewField] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<number[]>([]);

  // Inline editing state for active template
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [showAddDocDropdown, setShowAddDocDropdown] = useState(false);
  const [docFilterText, setDocFilterText] = useState("");
  const [isAddingFieldInline, setIsAddingFieldInline] = useState(false);
  const [newFieldInlineValue, setNewFieldInlineValue] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  // Handle Field Tag additions in CREATION form
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

  // Handle doc template checkbox toggle in CREATION form
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
    setIsCreating(true);
  }

  // Handle Save for CREATION Form
  async function handleSaveNew() {
    if (!templateName.trim()) {
      alert("Please enter a template name.");
      return;
    }

    try {
      const newId = await invoke<number>("create_case_template", {
        name: templateName.trim(),
        fields,
        docTemplateIds: selectedDocs,
      });
      setSelectedTemplateId(newId);
      setIsCreating(false);
      await loadData();
    } catch (err) {
      alert(`Error creating case template: ${err}`);
    }
  }

  // Cancel creation form
  function handleCancelCreate() {
    setIsCreating(false);
  }

  // Handle Delete (opens custom warning modal)
  function handleDelete() {
    if (!selectedTemplateId) return;
    setShowDeleteConfirm(true);
  }

  // Actual execution of template deletion
  async function confirmDeleteInline() {
    if (!selectedTemplateId) return;
    try {
      await invoke("delete_case_template", { id: selectedTemplateId });
      const remaining = caseTemplates.filter((ct) => ct.id !== selectedTemplateId);
      setSelectedTemplateId(remaining.length > 0 ? remaining[0].id : null);
      setShowDeleteConfirm(false);
      setIsCreating(false);
      await loadData();
    } catch (err) {
      alert(`Error deleting case template: ${err}`);
    }
  }

  // Select a template from list
  function handleSelectTemplate(id: number) {
    setSelectedTemplateId(id);
    setIsCreating(false);
    setIsEditingName(false);
    setShowAddDocDropdown(false);
    setIsAddingFieldInline(false);
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

  // --- INLINE EDITING ACTIONS ---

  // Save template rename
  async function handleSaveNameInline(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!activeTemplate || !editingNameValue.trim()) return;
    try {
      let fieldsArr = JSON.parse(activeTemplate.fields);
      await invoke("update_case_template", {
        id: activeTemplate.id,
        name: editingNameValue.trim(),
        fields: fieldsArr,
        docTemplateIds: activeTemplate.doc_template_ids,
      });
      setIsEditingName(false);
      await loadData();
    } catch (err) {
      alert(`Error renaming template: ${err}`);
    }
  }

  // Remove document inline
  async function handleRemoveDocInline(docIdToRemove: number) {
    if (!activeTemplate) return;
    try {
      let fieldsArr = JSON.parse(activeTemplate.fields);
      let updatedDocs = activeTemplate.doc_template_ids.filter(id => id !== docIdToRemove);
      await invoke("update_case_template", {
        id: activeTemplate.id,
        name: activeTemplate.name,
        fields: fieldsArr,
        docTemplateIds: updatedDocs,
      });
      await loadData();
    } catch (err) {
      alert(`Error removing document: ${err}`);
    }
  }

  // Add document inline
  async function handleAddDocInline(docIdToAdd: number) {
    if (!activeTemplate) return;
    try {
      let fieldsArr = JSON.parse(activeTemplate.fields);
      let updatedDocs = [...activeTemplate.doc_template_ids, docIdToAdd];
      await invoke("update_case_template", {
        id: activeTemplate.id,
        name: activeTemplate.name,
        fields: fieldsArr,
        docTemplateIds: updatedDocs,
      });
      setShowAddDocDropdown(false);
      await loadData();
    } catch (err) {
      alert(`Error adding document: ${err}`);
    }
  }

  // Remove required field inline
  async function handleRemoveFieldInline(fieldToRemove: string) {
    if (!activeTemplate) return;
    try {
      let fieldsArr = JSON.parse(activeTemplate.fields).filter((f: string) => f !== fieldToRemove);
      await invoke("update_case_template", {
        id: activeTemplate.id,
        name: activeTemplate.name,
        fields: fieldsArr,
        docTemplateIds: activeTemplate.doc_template_ids,
      });
      await loadData();
    } catch (err) {
      alert(`Error removing field: ${err}`);
    }
  }

  // Add required field inline
  async function handleAddFieldInline(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTemplate) return;
    const cleanField = newFieldInlineValue.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!cleanField) return;
    try {
      let fieldsArr = JSON.parse(activeTemplate.fields);
      if (!fieldsArr.includes(cleanField)) {
        fieldsArr.push(cleanField);
        await invoke("update_case_template", {
          id: activeTemplate.id,
          name: activeTemplate.name,
          fields: fieldsArr,
          docTemplateIds: activeTemplate.doc_template_ids,
        });
      }
      setNewFieldInlineValue("");
      setIsAddingFieldInline(false);
      await loadData();
    } catch (err) {
      alert(`Error adding field: ${err}`);
    }
  }

  // Unassociated document templates for inline selector
  const unassociatedDocs = docTemplates.filter(
    (doc) => activeTemplate && !activeTemplate.doc_template_ids.includes(doc.id)
  );

  // Filtered unassociated docs based on search text
  const filteredUnassociatedDocs = unassociatedDocs.filter(
    (doc) =>
      doc.file_name.toLowerCase().includes(docFilterText.toLowerCase()) ||
      (doc.title && doc.title.toLowerCase().includes(docFilterText.toLowerCase()))
  );

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
          
          {/* Left Column: Templates List (1/3 width) */}
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
                          ? "bg-accent/40 border-primary border-b"
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
            {isCreating ? (
              /* NEW CASE TEMPLATE CREATION FORM */
              <div className="space-y-6 max-w-3xl animate-in slide-in-from-bottom duration-300">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="text-lg font-bold text-foreground">Create New Case Template</h3>
                  <Button variant="ghost" size="sm" onClick={handleCancelCreate} className="h-7 text-xs">
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
                  <Button variant="outline" onClick={handleCancelCreate}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveNew}>
                    Create Template
                  </Button>
                </div>
              </div>
            ) : activeTemplate ? (
              /* DETAILED VIEW - WITH INLINE EDITING */
              <div className="space-y-6 animate-in fade-in duration-300">
                
                {/* Detail View Title and Actions */}
                <div className="flex items-start justify-between border-b border-border pb-4">
                  <div>
                    {isEditingName ? (
                      <form onSubmit={handleSaveNameInline} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editingNameValue}
                          onChange={(e) => setEditingNameValue(e.target.value)}
                          className="text-xl font-bold border-b border-primary bg-transparent focus:outline-none py-0.5 text-foreground"
                          autoFocus
                        />
                        <button type="submit" className="text-green-600 hover:text-green-800 text-sm font-semibold p-1" title="Save name">
                          ✓
                        </button>
                        <button type="button" onClick={() => setIsEditingName(false)} className="text-red-500 hover:text-red-700 text-sm font-semibold p-1" title="Cancel">
                          ✕
                        </button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold text-foreground tracking-tight">{activeTemplate.name}</h3>
                        <button
                          onClick={() => {
                            setIsEditingName(true);
                            setEditingNameValue(activeTemplate.name);
                          }}
                          className="p-1 text-muted-foreground hover:text-foreground hover:scale-110 transition-transform"
                          title="Rename case template"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Created on {formatDate(activeTemplate.created_at)}
                    </p>
                  </div>
                  <div>
                    <button
                      onClick={handleDelete}
                      className="text-xs font-semibold text-muted-foreground hover:text-destructive hover:underline px-3 py-1.5 transition-colors"
                    >
                      Delete Template
                    </button>
                  </div>
                </div>

                {/* Left/Right Split in Detail Column */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  
                  {/* Documents Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b pb-1 relative">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Document Templates ({activeTemplate.doc_template_ids.length})
                      </h4>

                      {/* Dropdown Popover for adding document inline */}
                      {showAddDocDropdown && (
                        <div className="absolute right-0 top-6 z-20 w-[500px] bg-card border border-border rounded-lg shadow-xl p-3.5 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
                          <div className="flex items-center justify-between border-b pb-1.5">
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Document Template</span>
                            <button 
                              onClick={() => {
                                setShowAddDocDropdown(false);
                                setDocFilterText("");
                              }} 
                              className="text-muted-foreground hover:text-foreground font-semibold"
                            >
                              ✕
                            </button>
                          </div>
                          {unassociatedDocs.length === 0 ? (
                            <div className="text-xs text-muted-foreground italic p-2 text-center">All templates already added.</div>
                          ) : (
                            <>
                              <input 
                                type="text"
                                placeholder="Search by filename or title..."
                                value={docFilterText}
                                onChange={(e) => setDocFilterText(e.target.value)}
                                className="w-full rounded border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
                                autoFocus
                              />
                              <div className="max-h-[220px] overflow-y-auto divide-y divide-border border rounded bg-muted/5">
                                {filteredUnassociatedDocs.length === 0 ? (
                                  <div className="text-xs text-muted-foreground italic p-3 text-center">No matching templates found.</div>
                                ) : (
                                  filteredUnassociatedDocs.map((doc) => (
                                    <div
                                      key={doc.id}
                                      onClick={() => {
                                        handleAddDocInline(doc.id);
                                        setDocFilterText("");
                                      }}
                                      className="flex items-center justify-between p-2.5 hover:bg-muted/50 cursor-pointer text-xs transition-colors gap-4"
                                    >
                                      <span className="font-mono text-foreground truncate max-w-[220px]" title={doc.file_name}>
                                        {doc.file_name}
                                      </span>
                                      <span className="text-muted-foreground truncate max-w-[220px] text-right italic" title={doc.title || ""}>
                                        {doc.title || "(No title indexed)"}
                                      </span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {!showAddDocDropdown && (
                        <button
                          onClick={() => setShowAddDocDropdown(true)}
                          className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline hover:text-primary/80 font-medium"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline">
                            <path d="M5 12h14" />
                            <path d="M12 5v14" />
                          </svg>
                          Add Document
                        </button>
                      )}
                    </div>

                    {activeTemplate.doc_template_ids.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No document templates associated with this case template.</p>
                    ) : (
                      <div className="space-y-2">
                        {activeTemplate.doc_template_ids.map((id) => (
                          <div
                            key={id}
                            className="flex items-center justify-between p-3 rounded-md border border-border bg-muted/20 hover:bg-muted/30 transition-colors"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-foreground truncate" title={getDocName(id)}>
                                {getDocName(id)}
                              </span>
                              {(() => {
                                const doc = docTemplates.find(d => d.id === id);
                                return doc && doc.title ? (
                                  <span className="block text-xs text-muted-foreground italic truncate mt-0.5" title={doc.title}>
                                    {doc.title}
                                  </span>
                                ) : null;
                              })()}
                              <span className="inline-flex items-center gap-2 text-[10px] text-muted-foreground font-mono mt-1">
                                <span className="uppercase text-[8px] bg-muted px-1.5 py-0.2 rounded border">
                                  {getDocExt(id)}
                                </span>
                                <span>{getDocFieldCount(id)} fields found</span>
                              </span>
                            </div>
                            <button
                              onClick={() => handleRemoveDocInline(id)}
                              className="p-1 text-muted-foreground hover:text-destructive hover:scale-110 transition-transform ml-2"
                              title="Remove document from template"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 6 6 18" />
                                <path d="m6 6 12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Required Fields Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b pb-1">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Required Fields ({(() => {
                          try { return JSON.parse(activeTemplate.fields).length; } catch { return 0; }
                        })()})
                      </h4>

                      {/* Inline Input to add fields */}
                      {isAddingFieldInline ? (
                        <form onSubmit={handleAddFieldInline} className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={newFieldInlineValue}
                            onChange={(e) => setNewFieldInlineValue(e.target.value)}
                            placeholder="new_field"
                            className="rounded border border-input bg-background px-2 py-0.5 text-xs font-mono w-28 focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
                            autoFocus
                          />
                          <button type="submit" className="text-green-600 hover:text-green-800 text-xs font-bold" title="Confirm">
                            ✓
                          </button>
                          <button type="button" onClick={() => setIsAddingFieldInline(false)} className="text-red-500 hover:text-red-700 text-xs font-bold" title="Cancel">
                            ✕
                          </button>
                        </form>
                      ) : (
                        <button
                          onClick={() => {
                            setIsAddingFieldInline(true);
                            setNewFieldInlineValue("");
                          }}
                          className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline hover:text-primary/80 font-medium"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline">
                            <path d="M5 12h14" />
                            <path d="M12 5v14" />
                          </svg>
                          Add Field
                        </button>
                      )}
                    </div>

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
                              className="text-xs font-mono bg-secondary text-secondary-foreground pl-2.5 pr-1.5 py-1 rounded-full border border-border inline-flex items-center gap-1.5"
                            >
                              {field}
                              <button
                                onClick={() => handleRemoveFieldInline(field)}
                                className="text-muted-foreground hover:text-destructive hover:scale-110 transition-transform font-bold text-[10px]"
                                title={`Remove field variable "${field}"`}
                              >
                                ✕
                              </button>
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

      {/* Delete Warning Confirmation Modal */}
      {showDeleteConfirm && activeTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-card border border-border rounded-lg shadow-2xl p-6 space-y-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" x2="12" y1="9" y2="13" />
                  <line x1="12" x2="12.01" y1="17" y2="17" />
                </svg>
              </div>
              <div className="space-y-1.5">
                <h3 className="text-lg font-bold text-foreground">Delete Case Template?</h3>
                <p className="text-sm text-muted-foreground leading-normal">
                  Are you sure you want to delete the case template <strong className="text-foreground">"{activeTemplate.name}"</strong>? 
                  This will permanently delete this template configuration and cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-border pt-4">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <button
                onClick={confirmDeleteInline}
                className="rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 px-4 py-2 text-sm font-medium transition-colors shadow-sm"
              >
                Delete Template
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
