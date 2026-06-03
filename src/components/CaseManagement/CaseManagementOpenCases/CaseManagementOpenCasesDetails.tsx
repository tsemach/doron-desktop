import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import OpenCasesDocumentAnnotationsModal from "./OpenCasesDocumentAnnotationsModal";
import OpenCasesAddDocumentModal from "./OpenCasesAddDocumentModal";
import OpenCasesFieldsModal from "./OpenCasesFieldsModal";
import OpenCasesDocumentDeleteModal from "./OpenCasesDocumentDeleteModal";
import OpenCasesDocumentsPanel from "./OpenCasesDocumentsPanel";
import { Button } from "@/components/ui/button";
import mammoth from "mammoth";

type CaseStatus = "open" | "in-progress" | "closed";

interface Case {
  id: string;
  subject?: string;
  status: CaseStatus;
  name: string;
  createdAt: string;
  updatedAt?: string;
  folder?: string;
}

interface CaseFile {
  name: string;
  path: string;
  ext: string;
  size_kb: number;
  title?: string;
  notes?: string;
  tags: string[];
}

export default function CaseManagementOpenCasesDetails() {
  const { caseId } = useParams<{ caseId: string }>();
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);

  // Documents states
  const [documents, setDocuments] = useState<CaseFile[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [editingDoc, setEditingDoc] = useState<CaseFile | null>(null);
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [showFieldsModal, setShowFieldsModal] = useState(false);
  const [docToDelete, setDocToDelete] = useState<CaseFile | null>(null);

  // Document preview states
  const [selectedDocument, setSelectedDocument] = useState<CaseFile | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);

  // General loading/error
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Split pane states
  const [leftPercent, setLeftPercent] = useState(30);
  const [isDragging, setIsDragging] = useState(false);
  const [isLgScreen, setIsLgScreen] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      setIsLgScreen(window.innerWidth >= 1024);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.getElementById("case-management-split-container");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const percentage = (relativeX / rect.width) * 100;
      const clamped = Math.max(20, Math.min(80, percentage));
      setLeftPercent(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    if (caseId) {
      loadCase(caseId);
    }
  }, [caseId]);

  // Fetch documents when selected case changes
  useEffect(() => {
    if (selectedCase?.folder) {
      loadDocuments(selectedCase.folder);
    } else {
      setDocuments([]);
    }
  }, [selectedCase?.id, selectedCase?.folder]);

  // Handle selected document preview loading
  useEffect(() => {
    if (!selectedDocument) {
      setPreviewHtml(null);
      setPreviewText(null);
      setPreviewError(null);
      return;
    }

    let active = true;

    async function loadPreview() {
      setPreviewLoading(true);
      setPreviewError(null);
      setPreviewHtml(null);
      setPreviewText(null);

      try {
        const ext = selectedDocument!.ext.toLowerCase();
        if (ext === "docx") {
          const bytes = await invoke<number[]>("read_file_bytes", { path: selectedDocument!.path });
          if (!active) return;
          const arrayBuffer = new Uint8Array(bytes).buffer;
          const result = await mammoth.convertToHtml({ arrayBuffer });
          if (!active) return;
          setPreviewHtml(result.value);
        } else if (ext === "txt" || ext === "json" || ext === "md") {
          const bytes = await invoke<number[]>("read_file_bytes", { path: selectedDocument!.path });
          if (!active) return;
          const text = new TextDecoder().decode(new Uint8Array(bytes));
          setPreviewText(text);
        } else {
          setPreviewError("Direct preview is only supported for Word (.docx) and Text (.txt, .md) files. Please use the open icon to view this file in your default application.");
        }
      } catch (err) {
        if (!active) return;
        console.error("Failed to load document preview:", err);
        setPreviewError("Failed to load document preview: " + err);
      } finally {
        if (active) {
          setPreviewLoading(false);
        }
      }
    }

    loadPreview();

    return () => {
      active = false;
    };
  }, [selectedDocument]);

  async function loadCase(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<any[]>("list_cases");
      const mapped = res.map((c) => ({
        id: String(c.id),
        subject: c.subject,
        status: c.status as CaseStatus,
        name: c.name,
        createdAt: c.created_at ? c.created_at.split("T")[0] : "—",
        updatedAt: c.updated_at ? c.updated_at.split("T")[0] : undefined,
        folder: c.folder,
      }));
      const found = mapped.find((c) => c.id === id);
      if (found) {
        setSelectedCase(found);
      } else {
        setError(`Case with ID ${id} not found.`);
      }
    } catch (err) {
      setError("Failed to load case: " + err);
    } finally {
      setLoading(false);
    }
  }

  async function loadDocuments(folderPath: string) {
    setDocsLoading(true);
    setDocsError(null);
    try {
      const files = await invoke<CaseFile[]>("list_case_files", { folderPath });
      setDocuments(files);
    } catch (err) {
      console.error(err);
      setDocsError(String(err));
    } finally {
      setDocsLoading(false);
    }
  }

  async function handleOpenFile(filePath: string) {
    try {
      await openPath(filePath);
    } catch (e) {
      console.error("Failed to open file:", e);
      alert(`Failed to open file: ${e}`);
    }
  }

  function handleRemoveDocument(doc: CaseFile) {
    setDocToDelete(doc);
  }

  async function confirmRemoveDocument() {
    if (!docToDelete || !selectedCase) return;
    const doc = docToDelete;
    setDocToDelete(null);

    setDocsLoading(true);
    setDocsError(null);
    try {
      await invoke("remove_file_from_case", {
        caseId: Number(selectedCase.id),
        fileName: doc.name,
      });
      
      // If the currently previewed document is deleted, clear the preview
      if (selectedDocument?.path === doc.path) {
        setSelectedDocument(null);
      }

      if (selectedCase.folder) {
        await loadDocuments(selectedCase.folder);
      }
    } catch (err) {
      console.error(err);
      setDocsError(String(err));
    } finally {
      setDocsLoading(false);
    }
  }

  return (
    <main className="flex-1 overflow-hidden p-6 bg-background flex flex-col h-screen">
      {/* Scope styles for the converted DOCX output */}
      <style>{`
        .docx-content-view h1 {
          font-size: 1.45rem;
          font-weight: 700;
          margin-top: 1.4rem;
          margin-bottom: 0.75rem;
          color: var(--foreground);
          border-b: 1px solid var(--border);
          padding-bottom: 0.25rem;
        }
        .docx-content-view h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 1.2rem;
          margin-bottom: 0.5rem;
          color: var(--foreground);
        }
        .docx-content-view h3 {
          font-size: 1.1rem;
          font-weight: 600;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
          color: var(--foreground);
        }
        .docx-content-view p {
          margin-bottom: 0.75rem;
          line-height: 1.6;
        }
        .docx-content-view ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .docx-content-view ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
        }
        .docx-content-view li {
          margin-bottom: 0.25rem;
        }
        .docx-content-view table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
          margin-bottom: 1rem;
          font-size: 0.85rem;
        }
        .docx-content-view th, .docx-content-view td {
          border: 1px solid var(--border);
          padding: 0.5rem 0.75rem;
          text-align: left;
        }
        .docx-content-view th {
          background-color: var(--muted);
          font-weight: 600;
        }
        .docx-content-view blockquote {
          border-left: 4px solid var(--primary);
          padding-left: 1rem;
          font-style: italic;
          color: var(--muted-foreground);
          margin-bottom: 0.75rem;
        }
      `}</style>

      {/* Header with back button */}
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <Link
          to="/case-management"
          className="p-2 hover:bg-muted rounded-lg transition-colors border border-border shrink-0"
          title="Back to Open Cases"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Case Management</span>
            <span className="text-muted-foreground/60 text-xs">/</span>
            <span className="text-sm font-medium text-foreground">Case Detail</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-1">
            {selectedCase?.subject || "Loading Case..."}
          </h1>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive shrink-0">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <div className="animate-spin text-3xl font-bold mb-2">⟳</div>
          <p className="text-sm">Loading case details...</p>
        </div>
      ) : (
        /* Main split container */
        <div
          id="case-management-split-container"
          className={`flex-1 min-h-0 flex ${isLgScreen ? "flex-row gap-0" : "flex-col gap-6"} items-stretch mb-6 relative ${isDragging ? "select-none cursor-col-resize" : ""}`}
        >
          {/* Left side: Case Documents Panel */}
          <OpenCasesDocumentsPanel
            selectedCase={selectedCase}
            documents={documents}
            docsLoading={docsLoading}
            docsError={docsError}
            isLgScreen={isLgScreen}
            leftPercent={100 - leftPercent}
            onOpenFile={handleOpenFile}
            onRemoveDocument={handleRemoveDocument}
            onEditAnnotations={setEditingDoc}
            onShowFields={() => setShowFieldsModal(true)}
            onAddDocument={() => setShowAddDocModal(true)}
            onSelectDocument={setSelectedDocument}
            selectedDocument={selectedDocument}
          />

          {/* Resizable Divider (rendered only on large screens) */}
          {isLgScreen && (
            <div
              onMouseDown={() => setIsDragging(true)}
              className={`w-3 group cursor-col-resize flex items-center justify-center shrink-0 z-20 select-none ${isDragging ? "bg-primary/10" : "hover:bg-primary/5"
                } transition-colors`}
            >
              {/* Grab handle indicator lines */}
              <div className={`w-1 h-12 rounded-full ${isDragging ? "bg-primary" : "bg-border/60 group-hover:bg-primary/50"
                } transition-colors`} />
            </div>
          )}

          {/* Right side: Document Previewer */}
          <div
            style={isLgScreen ? { flex: `0 0 calc(${100 - leftPercent}% - 6px)` } : undefined}
            className="flex flex-col border border-border rounded-xl bg-card overflow-hidden h-full shadow-xs"
          >
            <div className="bg-muted px-4 py-3 border-b border-border font-semibold text-sm text-foreground flex items-center justify-between shrink-0">
              <span>Document Preview</span>
              {selectedDocument && (
                <span className="text-xs text-muted-foreground font-mono font-normal truncate max-w-[200px]" title={selectedDocument.name}>
                  {selectedDocument.name}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto bg-background/50 dark:bg-background/20 relative">
              {!selectedDocument ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center animate-fade-in">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="36"
                    height="36"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-muted-foreground/30 mb-3"
                  >
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <p className="text-sm font-semibold">No Document Selected</p>
                  <p className="text-xs text-muted-foreground/80 mt-1 max-w-[280px]">
                    Select a document from the list on the left to preview its content here.
                  </p>
                </div>
              ) : previewLoading ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                  <div className="animate-spin text-3xl font-bold mb-2">⟳</div>
                  <p className="text-sm">Converting and loading preview...</p>
                </div>
              ) : previewError ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground animate-fade-in">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-amber-500 mb-3"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" x2="12" y1="8" y2="12" />
                    <line x1="12" x2="12.01" y1="16" y2="16" />
                  </svg>
                  <p className="text-sm font-semibold text-foreground">Preview Unavailable</p>
                  <p className="text-xs text-muted-foreground mt-1.5 max-w-[320px]">
                    {previewError}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenFile(selectedDocument.path)}
                    className="mt-4 gap-1.5"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M15 3h6v6" />
                      <path d="M10 14 21 3" />
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    </svg>
                    Open in External App
                  </Button>
                </div>
              ) : (
                <div className="p-6 md:p-8 w-full max-w-4xl bg-card min-h-full border-r border-border/40 shadow-xs animate-fade-in">
                  {previewHtml && (
                    <div
                      className="docx-content-view prose dark:prose-invert max-w-none text-foreground/90 text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  )}
                  {previewText && (
                    <pre className="font-mono text-xs whitespace-pre-wrap leading-relaxed text-foreground/90 bg-muted/30 p-4 rounded-lg border border-border/80">
                      {previewText}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editingDoc && (
        <OpenCasesDocumentAnnotationsModal
          fileName={editingDoc.name}
          filePath={editingDoc.path}
          initialNotes={editingDoc.notes}
          initialTags={editingDoc.tags}
          onCancel={() => setEditingDoc(null)}
          onSave={(notes, tags) => {
            setDocuments((prev) =>
              prev.map((d) =>
                d.path === editingDoc.path ? { ...d, notes, tags } : d
              )
            );
            // Sync current selected preview doc annotations if edited
            if (selectedDocument?.path === editingDoc.path) {
              setSelectedDocument((prev) => prev ? { ...prev, notes, tags } : null);
            }
            setEditingDoc(null);
          }}
          onDelete={() => {
            setDocuments((prev) =>
              prev.map((d) =>
                d.path === editingDoc.path ? { ...d, notes: undefined, tags: [] } : d
              )
            );
            if (selectedDocument?.path === editingDoc.path) {
              setSelectedDocument((prev) => prev ? { ...prev, notes: undefined, tags: [] } : null);
            }
            setEditingDoc(null);
          }}
        />
      )}

      {showAddDocModal && selectedCase?.folder && (
        <OpenCasesAddDocumentModal
          caseId={Number(selectedCase.id)}
          caseFolder={selectedCase.folder}
          onSave={() => {
            setShowAddDocModal(false);
            if (selectedCase.folder) {
              loadDocuments(selectedCase.folder);
            }
          }}
          onCancel={() => setShowAddDocModal(false)}
        />
      )}

      {showFieldsModal && selectedCase && (
        <OpenCasesFieldsModal
          caseId={Number(selectedCase.id)}
          caseName={selectedCase.name}
          onClose={() => setShowFieldsModal(false)}
        />
      )}

      {/* Modern Confirmation Modal for Document Deletion */}
      {docToDelete && (
        <OpenCasesDocumentDeleteModal
          docName={docToDelete.title || docToDelete.name}
          onConfirm={confirmRemoveDocument}
          onCancel={() => setDocToDelete(null)}
        />
      )}
    </main>
  );
}
