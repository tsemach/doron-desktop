import { useState, useEffect } from "react";
import { CaseTemplate, DocTemplate } from "./types";
import DeleteWarningModal from "./DeleteWarningModal";

interface TemplateDetailViewProps {
  activeTemplate: CaseTemplate;
  docTemplates: DocTemplate[];
  onDelete: () => Promise<void>;
  onRename: (newName: string) => Promise<void>;
  onAddDoc: (docId: number) => Promise<void>;
  onRemoveDoc: (docId: number) => Promise<void>;
  onAddField: (fieldName: string) => Promise<void>;
  onRemoveField: (fieldName: string) => Promise<void>;
}

export default function TemplateDetailView({
  activeTemplate,
  docTemplates,
  onDelete,
  onRename,
  onAddDoc,
  onRemoveDoc,
  onAddField,
  onRemoveField,
}: TemplateDetailViewProps) {
  // Inline editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [showAddDocDropdown, setShowAddDocDropdown] = useState(false);
  const [docFilterText, setDocFilterText] = useState("");
  const [isAddingFieldInline, setIsAddingFieldInline] = useState(false);
  const [newFieldInlineValue, setNewFieldInlineValue] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Sync editing name if activeTemplate changes
  useEffect(() => {
    setIsEditingName(false);
    setShowAddDocDropdown(false);
    setIsAddingFieldInline(false);
    setShowDeleteConfirm(false);
    setEditingNameValue(activeTemplate.name);
  }, [activeTemplate]);

  // Rename inline
  async function handleSaveNameInline(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!editingNameValue.trim()) return;
    await onRename(editingNameValue.trim());
    setIsEditingName(false);
  }

  // Add field inline
  async function handleAddFieldInline(e: React.FormEvent) {
    e.preventDefault();
    const cleanField = newFieldInlineValue.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!cleanField) return;
    await onAddField(cleanField);
    setNewFieldInlineValue("");
    setIsAddingFieldInline(false);
  }

  // Get unassociated document templates
  const unassociatedDocs = docTemplates.filter(
    (doc) => !activeTemplate.doc_template_ids.includes(doc.id)
  );

  // Filtered unassociated docs
  const filteredUnassociatedDocs = unassociatedDocs.filter(
    (doc) =>
      doc.file_name.toLowerCase().includes(docFilterText.toLowerCase()) ||
      (doc.title && doc.title.toLowerCase().includes(docFilterText.toLowerCase()))
  );

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

  function getDocName(id: number): string {
    const doc = docTemplates.find((d) => d.id === id);
    return doc ? doc.file_name : `Unknown Doc (${id})`;
  }

  function getDocExt(id: number): string {
    const doc = docTemplates.find((d) => d.id === id);
    return doc ? doc.file_ext : "";
  }

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
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Title & Delete Header */}
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
            onClick={() => setShowDeleteConfirm(true)}
            className="text-xs font-semibold text-muted-foreground hover:text-destructive hover:underline px-3 py-1.5 transition-colors"
          >
            Delete Template
          </button>
        </div>
      </div>

      {/* Main Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Associated Documents Column */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b pb-1 relative">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Document Templates ({activeTemplate.doc_template_ids.length})
            </h4>

            {/* Floating popover to add unassociated documents */}
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
                              onAddDoc(doc.id);
                              setDocFilterText("");
                              setShowAddDocDropdown(false);
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
                    onClick={() => onRemoveDoc(id)}
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

        {/* Required Fields Column */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b pb-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Required Fields ({(() => {
                try { return JSON.parse(activeTemplate.fields).length; } catch { return 0; }
              })()})
            </h4>

            {/* Inline add field tag input */}
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
                      onClick={() => onRemoveField(field)}
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <DeleteWarningModal
          templateName={activeTemplate.name}
          onConfirm={onDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
