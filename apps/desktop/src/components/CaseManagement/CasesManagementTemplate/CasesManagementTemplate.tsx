import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DocTemplate, CaseTemplate } from "../CaseManagementTypes";
import CaseTemplateList from "./CaseTemplateList";
import CaseTemplateCreateForm from "./CaseTemplateCreateForm";
import CaseTemplateDetailsView from "./CaseTemplateDetailsView";
import CaseTemplateEmptyState from "./CaseTemplateEmptyState";
import { Button } from "../../ui/button";
import CaseManagementSearch from "../CaseManagementSearch";

export default function CasesManagementTemplate() {
  const [caseTemplates, setCaseTemplates] = useState<CaseTemplate[]>([]);
  const [docTemplates, setDocTemplates] = useState<DocTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection states
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const activeTemplate = caseTemplates.find((ct) => ct.id === selectedTemplateId) || null;

  // Sidebar resizing states
  const containerRef = useRef<HTMLDivElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);

  // Add Document Popover states
  const [showAddDocDropdown, setShowAddDocDropdown] = useState(false);
  const [selectedAddDocIds, setSelectedAddDocIds] = useState<number[]>([]);
  const [docFilterText, setDocFilterText] = useState("");

  useEffect(() => {
    setShowAddDocDropdown(false);
    setSelectedAddDocIds([]);
    setDocFilterText("");
  }, [selectedTemplateId]);

  function handleOpenAddDoc() {
    setSelectedAddDocIds([]);
    setDocFilterText("");
    setShowAddDocDropdown(true);
  }

  // Get unassociated document templates
  const unassociatedDocs = activeTemplate
    ? docTemplates.filter((doc) => !activeTemplate.doc_template_ids.includes(doc.id))
    : [];

  // Filtered unassociated docs
  const filteredUnassociatedDocs = unassociatedDocs.filter(
    (doc) =>
      doc.file_name.toLowerCase().includes(docFilterText.toLowerCase()) ||
      (doc.title && doc.title.toLowerCase().includes(docFilterText.toLowerCase()))
  );

  const startResizing = (mouseDownEvent: React.MouseEvent) => {
    mouseDownEvent.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;
      const containerLeft = containerRef.current.getBoundingClientRect().left;
      const newWidth = Math.max(200, Math.min(600, e.clientX - containerLeft));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

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

      // Auto-select first template if none is selected and list is not empty
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

  function getManualFields(template: CaseTemplate): string[] {
    let fieldsArr: string[] = [];
    try {
      fieldsArr = JSON.parse(template.fields);
    } catch { }

    const docFields = new Set<string>();
    template.doc_template_ids.forEach(docId => {
      const doc = docTemplates.find(d => d.id === docId);
      if (doc) {
        try {
          const fs = JSON.parse(doc.fields_found);
          if (Array.isArray(fs)) {
            fs.forEach(f => docFields.add(f));
          }
        } catch { }
      }
    });

    return fieldsArr.filter(f => !docFields.has(f));
  }



  // --- ACTIONS ---

  // Create Case Template
  async function handleCreateTemplate(name: string, fields: string[], docTemplateIds: number[]) {
    try {
      const newId = await invoke<number>("create_case_template", {
        name,
        fields,
        docTemplateIds,
      });
      setSelectedTemplateId(newId);
      setIsCreating(false);
      await loadData();
    } catch (err) {
      alert(`Error creating case template: ${err}`);
      throw err;
    }
  }

  // Delete Case Template
  async function handleDeleteTemplate() {
    if (!selectedTemplateId) return;
    try {
      await invoke("delete_case_template", { id: selectedTemplateId });
      const remaining = caseTemplates.filter((ct) => ct.id !== selectedTemplateId);
      setSelectedTemplateId(remaining.length > 0 ? remaining[0].id : null);
      setIsCreating(false);
      await loadData();
    } catch (err) {
      alert(`Error deleting case template: ${err}`);
    }
  }

  // Inline Rename
  async function handleRenameTemplate(newName: string) {
    if (!activeTemplate) return;
    try {
      const manualFields = getManualFields(activeTemplate);
      await invoke("update_case_template", {
        id: activeTemplate.id,
        name: newName,
        fields: manualFields,
        docTemplateIds: activeTemplate.doc_template_ids,
      });
      await loadData();
    } catch (err) {
      alert(`Error renaming template: ${err}`);
    }
  }

  // Inline Add Document
  async function handleAddDoc(docIds: number[]) {
    if (!activeTemplate) return;
    if (docIds.length === 0) return;
    try {
      const manualFields = getManualFields(activeTemplate);
      const updatedDocs = [...activeTemplate.doc_template_ids, ...docIds];
      await invoke("update_case_template", {
        id: activeTemplate.id,
        name: activeTemplate.name,
        fields: manualFields,
        docTemplateIds: updatedDocs,
      });
      await loadData();
    } catch (err) {
      alert(`Error adding documents: ${err}`);
    }
  }

  // Inline Remove Document
  async function handleRemoveDoc(docId: number) {
    if (!activeTemplate) return;
    try {
      const manualFields = getManualFields(activeTemplate);
      const updatedDocs = activeTemplate.doc_template_ids.filter((id) => id !== docId);
      await invoke("update_case_template", {
        id: activeTemplate.id,
        name: activeTemplate.name,
        fields: manualFields,
        docTemplateIds: updatedDocs,
      });
      await loadData();
    } catch (err) {
      alert(`Error removing document: ${err}`);
    }
  }

  // Inline Add Field Tag
  async function handleAddField(fieldName: string) {
    if (!activeTemplate) return;
    try {
      const manualFields = getManualFields(activeTemplate);
      if (!manualFields.includes(fieldName)) {
        manualFields.push(fieldName);
        await invoke("update_case_template", {
          id: activeTemplate.id,
          name: activeTemplate.name,
          fields: manualFields,
          docTemplateIds: activeTemplate.doc_template_ids,
        });
      }
      await loadData();
    } catch (err) {
      alert(`Error adding field: ${err}`);
    }
  }

  // Inline Remove Field Tag
  async function handleRemoveField(fieldName: string) {
    if (!activeTemplate) return;
    try {
      const manualFields = getManualFields(activeTemplate).filter((f) => f !== fieldName);
      await invoke("update_case_template", {
        id: activeTemplate.id,
        name: activeTemplate.name,
        fields: manualFields,
        docTemplateIds: activeTemplate.doc_template_ids,
      });
      await loadData();
    } catch (err) {
      alert(`Error removing field: ${err}`);
    }
  }

  // Inline Sync All Fields
  async function handleSyncAllFields() {
    if (!activeTemplate) return;
    try {
      await Promise.all(
        activeTemplate.doc_template_ids.map((docId) =>
          invoke("sync_template_fields", { templateId: docId })
        )
      );
      await loadData();
    } catch (err) {
      alert(`Error syncing document fields: ${err}`);
    }
  }

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden bg-background">
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
        <div ref={containerRef} className="flex-1 flex overflow-hidden">

          {/* Left Column: Templates List */}
          <CaseTemplateList
            caseTemplates={caseTemplates}
            selectedTemplateId={selectedTemplateId}
            isCreating={isCreating}
            onSelectTemplate={(id) => {
              setSelectedTemplateId(id);
              setIsCreating(false);
            }}
            onStartCreate={() => setIsCreating(true)}
            width={sidebarWidth}
          />

          {/* Draggable Resizable Divider */}
          <div
            onMouseDown={startResizing}
            className={`w-[1px] bg-border shrink-0 h-full relative cursor-col-resize select-none group transition-colors duration-150 ${isResizing ? "bg-primary" : "hover:bg-primary"
              }`}
          >
            <div className="absolute top-0 bottom-0 -left-1.5 -right-1.5 cursor-col-resize z-10" />
          </div>

          {/* Right Column: Detailed View / Forms */}
          <section className="flex-1 flex flex-col overflow-visible bg-background relative z-20">
            {showAddDocDropdown && activeTemplate && (
              <div
                className="absolute left-6 top-[84px] z-50 bg-card border border-border rounded-xl shadow-2xl p-4 flex flex-col space-y-4 resize overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
                style={{
                  width: "560px",
                  height: unassociatedDocs.length === 0 ? "auto" : "400px",
                  minWidth: "420px",
                  minHeight: "260px",
                  maxWidth: "92vw",
                  maxHeight: "80vh",
                }}
              >
                <div className="flex items-center justify-between border-b pb-2 shrink-0">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Document Templates</span>
                  <button
                    onClick={() => {
                      setShowAddDocDropdown(false);
                      setDocFilterText("");
                      setSelectedAddDocIds([]);
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
                    <CaseManagementSearch
                      value={docFilterText}
                      onChange={setDocFilterText}
                      placeholder="Search by filename or title..."
                      containerClassName="relative flex items-center w-full shrink-0"
                      inputClassName="w-full rounded border border-input bg-background pl-8 pr-7 rtl:pr-8 rtl:pl-7 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
                      autoFocus
                    />
                    <div className="flex-grow overflow-y-auto border rounded bg-muted/5 divide-y divide-border min-h-0">
                      {filteredUnassociatedDocs.length === 0 ? (
                        <div className="text-xs text-muted-foreground italic p-3 text-center">No matching templates found.</div>
                      ) : (
                        filteredUnassociatedDocs.map((doc) => {
                          const isChecked = selectedAddDocIds.includes(doc.id);
                          const hasTitle = !!doc.title;
                          const primaryText = hasTitle ? doc.title : doc.file_name;
                          const secondaryText = hasTitle ? doc.file_name : null;

                          return (
                            <div
                              key={doc.id}
                              onClick={() => {
                                setSelectedAddDocIds(prev =>
                                  prev.includes(doc.id) ? prev.filter(id => id !== doc.id) : [...prev, doc.id]
                                );
                              }}
                              className={`flex items-center gap-3 p-3 hover:bg-muted/60 cursor-pointer transition-colors ${
                                isChecked ? "bg-primary/5" : ""
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}} // Click is handled by parent div
                                className="rounded border-input text-primary focus:ring-ring h-3.5 w-3.5 cursor-pointer shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <span className="block text-xs font-semibold text-foreground truncate" title={primaryText || ""}>
                                  {primaryText}
                                </span>
                                {secondaryText && (
                                  <span className="block text-[10px] text-muted-foreground truncate mt-0.5" title={secondaryText}>
                                    {secondaryText}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                    
                    <div className="pt-2.5 flex items-center justify-between border-t mt-auto shrink-0 select-none">
                      <span className="text-[11px] text-muted-foreground font-medium">
                        {selectedAddDocIds.length} templates selected
                      </span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedAddDocIds([]);
                            setShowAddDocDropdown(false);
                            setDocFilterText("");
                          }}
                          className="cursor-pointer"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          disabled={selectedAddDocIds.length === 0}
                          onClick={async () => {
                            await handleAddDoc(selectedAddDocIds);
                            setDocFilterText("");
                            setSelectedAddDocIds([]);
                            setShowAddDocDropdown(false);
                          }}
                          className="cursor-pointer"
                        >
                          Add Selected
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="flex-1 flex flex-col overflow-y-auto p-6 min-h-0">
              {isCreating ? (
                <CaseTemplateCreateForm
                  docTemplates={docTemplates}
                  onSave={handleCreateTemplate}
                  onCancel={() => setIsCreating(false)}
                />
              ) : activeTemplate ? (
                <CaseTemplateDetailsView
                  activeTemplate={activeTemplate}
                  docTemplates={docTemplates}
                  onDelete={handleDeleteTemplate}
                  onRename={handleRenameTemplate}
                  onAddDoc={handleAddDoc}
                  onRemoveDoc={handleRemoveDoc}
                  onAddField={handleAddField}
                  onRemoveField={handleRemoveField}
                  onSyncAllFields={handleSyncAllFields}
                  showAddDocDropdown={showAddDocDropdown}
                  onOpenAddDoc={handleOpenAddDoc}
                />
              ) : (
                <CaseTemplateEmptyState />
              )}
            </div>
          </section>

        </div>
      )}
    </main>
  );
}
