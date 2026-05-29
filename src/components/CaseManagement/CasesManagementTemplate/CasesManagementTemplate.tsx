import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DocTemplate, CaseTemplate } from "./types";
import TemplateList from "./TemplateList";
import TemplateCreateForm from "./TemplateCreateForm";
import TemplateDetailView from "./TemplateDetailView";
import TemplateEmptyState from "./TemplateEmptyState";

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

      // Automatically check and sync each case template's stored fields
      // with all fields parsed from its associated document templates.
      const syncedCaseTemplates = caseRows.map(ct => {
        let storedFields: string[] = [];
        try {
          storedFields = JSON.parse(ct.fields);
        } catch {}

        const docFields = new Set<string>();
        ct.doc_template_ids.forEach(docId => {
          const doc = docRows.find(d => d.id === docId);
          if (doc) {
            try {
              const fs = JSON.parse(doc.fields_found);
              if (Array.isArray(fs)) {
                fs.forEach(f => docFields.add(f));
              }
            } catch {}
          }
        });

        // Merge any document fields that aren't already stored in ct.fields
        let merged = [...storedFields];
        let changed = false;
        docFields.forEach(f => {
          if (!merged.includes(f)) {
            merged.push(f);
            changed = true;
          }
        });

        if (changed) {
          // Fire-and-forget background invoke to save update to SQLite DB
          invoke("update_case_template", {
            id: ct.id,
            name: ct.name,
            fields: merged,
            docTemplateIds: ct.doc_template_ids,
          }).catch(err => console.error("Failed to auto-sync fields for case template:", err));

          return { ...ct, fields: JSON.stringify(merged) };
        }

        return ct;
      });

      setCaseTemplates(syncedCaseTemplates);
      setDocTemplates(docRows);

      // Auto-select first template if none is selected and list is not empty
      if (syncedCaseTemplates.length > 0 && selectedTemplateId === null) {
        setSelectedTemplateId(syncedCaseTemplates[0].id);
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
      const doc = docTemplates.find(d => d.id === docId);
      let docFields: string[] = [];
      if (doc) {
        try {
          docFields = JSON.parse(doc.fields_found);
        } catch {}
      }
      const updatedFields = Array.from(new Set([...fieldsArr, ...docFields]));
      const updatedDocs = [...activeTemplate.doc_template_ids, docId];
      await invoke("update_case_template", {
        id: activeTemplate.id,
        name: activeTemplate.name,
        fields: updatedFields,
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
      
      // Determine fields belonging to the doc we are removing
      const removingDoc = docTemplates.find(d => d.id === docId);
      let removingFields: string[] = [];
      if (removingDoc) {
        try {
          removingFields = JSON.parse(removingDoc.fields_found);
        } catch {}
      }

      // Determine fields belonging to all OTHER associated docs
      const otherDocIds = activeTemplate.doc_template_ids.filter(id => id !== docId);
      const otherFields = new Set<string>();
      otherDocIds.forEach(id => {
        const doc = docTemplates.find(d => d.id === id);
        if (doc) {
          try {
            const fs = JSON.parse(doc.fields_found);
            fs.forEach((f: string) => otherFields.add(f));
          } catch {}
        }
      });

      // Find fields that were added manually (fields not in any of the associated documents)
      const allDocFields = new Set<string>(removingFields);
      otherFields.forEach(f => allDocFields.add(f));
      const manualFields = fieldsArr.filter((f: string) => !allDocFields.has(f));

      // New fields list is the union of manual fields and fields from remaining documents
      const updatedFields = Array.from(new Set([...manualFields, ...Array.from(otherFields)]));
      const updatedDocs = activeTemplate.doc_template_ids.filter((id) => id !== docId);
      
      await invoke("update_case_template", {
        id: activeTemplate.id,
        name: activeTemplate.name,
        fields: updatedFields,
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
              <TemplateEmptyState />
            )}
          </section>

        </div>
      )}
    </main>
  );
}
