import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DocTemplate, CaseTemplate } from "./CasesManagementTemplate/types";
import TemplateList from "./CasesManagementTemplate/TemplateList";
import TemplateCreateForm from "./CasesManagementTemplate/TemplateCreateForm";
import TemplateDetailView from "./CasesManagementTemplate/TemplateDetailView";

export default function CasesManagementTemplate() {
  const [caseTemplates, setCaseTemplates] = useState<CaseTemplate[]>([]);
  const [docTemplates, setDocTemplates] = useState<DocTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection states
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);

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

  const activeTemplate = caseTemplates.find((ct) => ct.id === selectedTemplateId) || null;

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
      const fieldsArr = JSON.parse(activeTemplate.fields);
      await invoke("update_case_template", {
        id: activeTemplate.id,
        name: newName,
        fields: fieldsArr,
        docTemplateIds: activeTemplate.doc_template_ids,
      });
      await loadData();
    } catch (err) {
      alert(`Error renaming template: ${err}`);
    }
  }

  // Inline Add Document
  async function handleAddDoc(docId: number) {
    if (!activeTemplate) return;
    try {
      const fieldsArr = JSON.parse(activeTemplate.fields);
      const updatedDocs = [...activeTemplate.doc_template_ids, docId];
      await invoke("update_case_template", {
        id: activeTemplate.id,
        name: activeTemplate.name,
        fields: fieldsArr,
        docTemplateIds: updatedDocs,
      });
      await loadData();
    } catch (err) {
      alert(`Error adding document: ${err}`);
    }
  }

  // Inline Remove Document
  async function handleRemoveDoc(docId: number) {
    if (!activeTemplate) return;
    try {
      const fieldsArr = JSON.parse(activeTemplate.fields);
      const updatedDocs = activeTemplate.doc_template_ids.filter((id) => id !== docId);
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

  // Inline Add Field Tag
  async function handleAddField(fieldName: string) {
    if (!activeTemplate) return;
    try {
      const fieldsArr: string[] = JSON.parse(activeTemplate.fields);
      if (!fieldsArr.includes(fieldName)) {
        fieldsArr.push(fieldName);
        await invoke("update_case_template", {
          id: activeTemplate.id,
          name: activeTemplate.name,
          fields: fieldsArr,
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
      const fieldsArr: string[] = JSON.parse(activeTemplate.fields).filter((f: string) => f !== fieldName);
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
          <TemplateList
            caseTemplates={caseTemplates}
            selectedTemplateId={selectedTemplateId}
            isCreating={isCreating}
            onSelectTemplate={(id) => {
              setSelectedTemplateId(id);
              setIsCreating(false);
            }}
            onStartCreate={() => setIsCreating(true)}
          />

          {/* Right Column: Detailed View / Forms */}
          <section className="flex-1 flex flex-col overflow-y-auto bg-background p-6">
            {isCreating ? (
              <TemplateCreateForm
                docTemplates={docTemplates}
                onSave={handleCreateTemplate}
                onCancel={() => setIsCreating(false)}
              />
            ) : activeTemplate ? (
              <TemplateDetailView
                activeTemplate={activeTemplate}
                docTemplates={docTemplates}
                onDelete={handleDeleteTemplate}
                onRename={handleRenameTemplate}
                onAddDoc={handleAddDoc}
                onRemoveDoc={handleRemoveDoc}
                onAddField={handleAddField}
                onRemoveField={handleRemoveField}
              />
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
