import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import OpenCasesDocumentAnnotationsModal from "./OpenCasesDocumentAnnotationsModal";
import OpenCasesAddDocumentModal from "./OpenCasesAddDocumentModal";
import OpenCasesFieldsModal from "./OpenCasesFieldsModal";
import OpenCasesDocumentDeleteModal from "./OpenCasesDocumentDeleteModal";
import OpenCasesDocumentsPanel from "./OpenCasesDocumentsPanel";

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

  // General loading/error
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Split pane states
  const [leftPercent, setLeftPercent] = useState(50);
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

          {/* Right side: Empty panel for now */}
          <div
            style={isLgScreen ? { flex: `0 0 calc(${100 - leftPercent}% - 6px)` } : undefined}
            className="flex flex-col border border-dashed border-border rounded-xl bg-card/30 overflow-hidden h-full shadow-xs items-center justify-center text-muted-foreground p-8 text-center"
          >
            <p className="text-sm font-medium">Details View Right Side</p>
            <p className="text-xs text-muted-foreground/80 mt-1">
              This area is currently empty.
            </p>
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
            setEditingDoc(null);
          }}
          onDelete={() => {
            setDocuments((prev) =>
              prev.map((d) =>
                d.path === editingDoc.path ? { ...d, notes: undefined, tags: [] } : d
              )
            );
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
