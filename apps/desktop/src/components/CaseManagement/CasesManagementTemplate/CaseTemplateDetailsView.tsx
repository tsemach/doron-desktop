import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CaseTemplate, DocTemplate } from "../CaseManagementTypes";
import CaseTemplateDeleteWarningModal from "./CaseTemplateDeleteWarningModal";

interface CaseTemplateDetailsViewProps {
  activeTemplate: CaseTemplate;
  docTemplates: DocTemplate[];
  onDelete: () => Promise<void>;
  onRename: (newName: string) => Promise<void>;
  onAddDoc: (docIds: number[]) => Promise<void>;
  onRemoveDoc: (docId: number) => Promise<void>;
  onAddField: (fieldName: string) => Promise<void>;
  onRemoveField: (fieldName: string) => Promise<void>;
  onSyncAllFields: () => Promise<void>;
  showAddDocDropdown: boolean;
  onOpenAddDoc: () => void;
}

export default function CaseTemplateDetailsView({
  activeTemplate,
  docTemplates,
  onDelete,
  onRename,
  onRemoveDoc,
  onAddField,
  onRemoveField,
  onSyncAllFields,
  showAddDocDropdown,
  onOpenAddDoc,
}: CaseTemplateDetailsViewProps) {
  // Inline editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [isAddingFieldInline, setIsAddingFieldInline] = useState(false);
  const [newFieldInlineValue, setNewFieldInlineValue] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);

  // State for filtering fields by selected document
  const [selectedDocIdForFields, setSelectedDocIdForFields] = useState<number | null>(null);

  // Sync editing name if activeTemplate changes
  useEffect(() => {
    setIsEditingName(false);
    setIsAddingFieldInline(false);
    setShowDeleteConfirm(false);
    setSelectedDocIdForFields(null);
    setEditingNameValue(activeTemplate.name);
  }, [activeTemplate]);

  // Open Document File
  async function handleOpenDoc(path: string | undefined) {
    if (!path) {
      alert("No path found for this template document.");
      return;
    }
    try {
      await invoke("open_path", { path });
    } catch (err) {
      alert(`Failed to open template file: ${err}`);
    }
  }

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

  // Calculate automatically extracted fields versus manually added fields
  const associatedDocs = docTemplates.filter((doc) =>
    activeTemplate.doc_template_ids.includes(doc.id)
  );

  // Helper to parse document fields
  const getDocFields = (doc: DocTemplate): string[] => {
    try {
      return JSON.parse(doc.fields_found) as string[];
    } catch {
      return [];
    }
  };

  // Map each field to the documents containing it
  const fieldToDocsMap: Record<string, DocTemplate[]> = {};
  associatedDocs.forEach((doc) => {
    getDocFields(doc).forEach((f) => {
      if (!fieldToDocsMap[f]) {
        fieldToDocsMap[f] = [];
      }
      fieldToDocsMap[f].push(doc);
    });
  });

  const autoFields = Object.keys(fieldToDocsMap);

  let totalStoredFields: string[] = [];
  try {
    totalStoredFields = JSON.parse(activeTemplate.fields) as string[];
  } catch { }

  const manualFields = totalStoredFields.filter((f) => !autoFields.includes(f));
  const allCurrentFields = Array.from(new Set([...manualFields, ...autoFields]));

  // Fields filtered based on selection
  const filteredFields = allCurrentFields.filter((field) => {
    if (selectedDocIdForFields === null) return true;
    const docs = fieldToDocsMap[field] || [];
    return docs.some((d) => d.id === selectedDocIdForFields);
  });

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
        <div className="space-y-3 relative z-30">
          <div className="flex items-center justify-between border-b pb-1 relative z-40">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Document Templates ({activeTemplate.doc_template_ids.length})
            </h4>

            {!showAddDocDropdown && (
              <button
                onClick={onOpenAddDoc}
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
            <div className="space-y-2 relative z-10">
              {activeTemplate.doc_template_ids.map((id) => {
                const isSelected = selectedDocIdForFields === id;
                const doc = docTemplates.find(d => d.id === id);
                const hasTitle = !!(doc && doc.title);
                const primaryText = hasTitle ? doc!.title : getDocName(id);
                const secondaryText = hasTitle ? getDocName(id) : null;

                return (
                  <div
                    key={id}
                    onClick={() => setSelectedDocIdForFields(isSelected ? null : id)}
                    className={`flex items-center justify-between p-3 rounded-md border cursor-pointer transition-colors ${isSelected
                      ? "border-primary bg-primary/5 hover:bg-primary/25"
                      : "border-border bg-muted/20 hover:bg-muted"
                      }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground truncate" title={primaryText || ""}>
                        {primaryText}
                      </span>
                      {secondaryText && (
                        <span className="block text-xs text-muted-foreground italic truncate mt-0.5" title={secondaryText}>
                          {secondaryText}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-2 text-[10px] text-muted-foreground font-mono mt-1">
                        <span className="uppercase text-[8px] bg-muted px-1.5 py-0.2 rounded border">
                          {getDocExt(id)}
                        </span>
                        <span>{getDocFieldCount(id)} fields found</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      {/* Open file in external app */}
                      {doc && doc.marked_path ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDoc(doc.marked_path);
                          }}
                          className="p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-all cursor-pointer"
                          title="Open template document"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </button>
                      ) : null}



                      {/* Remove document link */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveDoc(id);
                        }}
                        className="p-1 text-muted-foreground hover:text-destructive hover:bg-accent rounded transition-all cursor-pointer"
                        title="Remove document from template"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Required Fields Column */}
        <div className="space-y-3 relative z-10">
          <div className="flex items-center justify-between border-b pb-1">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Required Fields {selectedDocIdForFields !== null ? `(Filtered)` : `(${allCurrentFields.length})`}
              </h4>
              {selectedDocIdForFields !== null && (
                <button
                  onClick={() => setSelectedDocIdForFields(null)}
                  className="text-[10px] font-semibold text-primary hover:text-primary/80 hover:underline bg-primary/5 border border-primary/20 px-1.5 py-0.5 rounded cursor-pointer"
                >
                  Show All
                </button>
              )}
            </div>

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
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    setSyncingAll(true);
                    try {
                      await onSyncAllFields();
                    } catch (err) {
                      console.error("Error syncing fields:", err);
                    } finally {
                      setSyncingAll(false);
                    }
                  }}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline hover:text-primary/80 font-medium cursor-pointer"
                  disabled={syncingAll || activeTemplate.doc_template_ids.length === 0}
                  title="Sync fields for all template documents"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`inline ${syncingAll ? "animate-spin text-blue-500" : ""}`}
                  >
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                  </svg>
                  Sync Fields
                </button>

                <button
                  onClick={() => {
                    setIsAddingFieldInline(true);
                    setNewFieldInlineValue("");
                  }}
                  className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline hover:text-primary/80 font-medium cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline">
                    <path d="M5 12h14" />
                    <path d="M12 5v14" />
                  </svg>
                  Add Field
                </button>
              </div>
            )}
          </div>

          {(() => {
            if (filteredFields.length === 0) {
              return <p className="text-xs text-muted-foreground italic">No required fields found.</p>;
            }

            return (
              <div className="flex flex-wrap gap-1.5">
                {filteredFields.map((field) => {
                  const isAuto = autoFields.includes(field);
                  const docsWithField = fieldToDocsMap[field] || [];

                  return (
                    <span
                      key={field}
                      className={`text-xs font-mono pl-2.5 pr-1.5 py-1 rounded-full border inline-flex items-center gap-1.5 ${isAuto
                        ? "bg-muted/80 text-muted-foreground border-border/80"
                        : "bg-secondary text-secondary-foreground border-border"
                        }`}
                      title={
                        isAuto
                          ? `Required by: ${docsWithField.map((d) => d.file_name).join(", ")}`
                          : "Manually added field"
                      }
                    >
                      {isAuto && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-muted-foreground/75"
                        >
                          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                        </svg>
                      )}
                      {field}
                      {!isAuto && (
                        <button
                          onClick={() => onRemoveField(field)}
                          className="text-muted-foreground hover:text-destructive hover:scale-110 transition-transform font-bold text-[10px]"
                          title={`Remove field variable "${field}"`}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            );
          })()}
        </div>

      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <CaseTemplateDeleteWarningModal
          templateName={activeTemplate.name}
          onConfirm={onDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
