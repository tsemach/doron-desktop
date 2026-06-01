import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import OpenCasesDocumentAnnotationsModal from "./OpenCasesDocumentAnnotationsModal";
import OpenCasesAddDocumentModal from "./OpenCasesAddDocumentModal";
import OpenCasesFieldsModal from "./OpenCasesFieldsModal";
import OpenCasesDocumentDeleteModal from "./OpenCasesDocumentDeleteModal";
import OpenCasesCaseDeleteModal from "./OpenCasesCaseDeleteModal";
import OpenCasesList from "./OpenCasesList";
import OpenCasesDocumentsPanel from "./OpenCasesDocumentsPanel";
import OpenCasesHeader from "./OpenCasesHeader";
import OpenCasesTopBar from "./OpenCasesTopBar";

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

export default function CaseManagementOpenCases() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<Case[]>([]);
  const [filter, setFilter] = useState<CaseStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);

  // Documents states
  const [documents, setDocuments] = useState<CaseFile[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [editingDoc, setEditingDoc] = useState<CaseFile | null>(null);
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [showFieldsModal, setShowFieldsModal] = useState(false);
  const [docToDelete, setDocToDelete] = useState<CaseFile | null>(null);
  const [caseToDelete, setCaseToDelete] = useState<Case | null>(null);

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
    loadCases();
  }, []);

  // Set initial selected case when cases are first loaded
  useEffect(() => {
    if (cases.length > 0 && !selectedCase) {
      setSelectedCase(cases[0]);
    }
  }, [cases]);

  // Keep selected case synced or fallback if it is deleted
  useEffect(() => {
    if (selectedCase) {
      const stillExists = cases.some((c) => c.id === selectedCase.id);
      if (!stillExists) {
        setSelectedCase(cases[0] || null);
      }
    }
  }, [cases, selectedCase]);

  // Fetch documents when selected case changes
  useEffect(() => {
    if (selectedCase?.folder) {
      loadDocuments(selectedCase.folder);
    } else {
      setDocuments([]);
    }
  }, [selectedCase?.id, selectedCase?.folder]);

  async function loadCases() {
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
      setCases(mapped);
    } catch (err) {
      setError("Failed to load cases: " + err);
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

  async function handleOpenFolder(folderPath: string) {
    try {
      await openPath(folderPath);
    } catch (e) {
      console.error("Failed to open folder:", e);
      alert(`Failed to open folder: ${e}`);
    }
  }

  function closeCase(id: string) {
    // For now update locally. We can extend to support database close later.
    setCases((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "closed" as const } : c))
    );
    if (selectedCase?.id === id) {
      setSelectedCase((prev) => prev ? { ...prev, status: "closed" as const } : null);
    }
  }

  function handleDeleteCase(c: Case) {
    setCaseToDelete(c);
  }

  async function confirmDeleteCase() {
    if (!caseToDelete) return;
    const id = caseToDelete.id;
    setCaseToDelete(null);
    setError(null);
    try {
      await invoke("delete_case", { id: Number(id) });
      setCases((prev) => prev.filter((c) => c.id !== id));
      if (selectedCase?.id === id) {
        setSelectedCase(null);
      }
    } catch (err) {
      setError("Failed to delete case: " + err);
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

  const filtered = cases.filter((c) => {
    if (filter !== "all" && c.status !== filter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const subjectMatch = c.subject?.toLowerCase().includes(q) ?? false;
      const nameMatch = c.name?.toLowerCase().includes(q) ?? false;
      const folderMatch = c.folder?.toLowerCase().includes(q) ?? false;
      const idMatch = c.id.toLowerCase().includes(q);
      return subjectMatch || nameMatch || folderMatch || idMatch;
    }
    return true;
  });

  return (
    <main className="flex-1 overflow-hidden p-6 bg-background flex flex-col h-screen">
      {/* Header */}
      <OpenCasesHeader
        casesCount={cases.length}
        onNewCase={() => navigate("/case-management/new-case")}
      />

      {error && (
        <div className="mb-4 rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive shrink-0">
          {error}
        </div>
      )}

      {/* Filters and Search Bar Row */}
      <OpenCasesTopBar
        filter={filter}
        setFilter={setFilter}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      {/* Main split container */}
      <div
        id="case-management-split-container"
        className={`flex-1 min-h-0 flex ${isLgScreen ? "flex-row gap-0" : "flex-col gap-6"} items-stretch mb-6 relative ${isDragging ? "select-none cursor-col-resize" : ""}`}
      >
        <OpenCasesList
          cases={filtered}
          selectedCase={selectedCase}
          loading={loading}
          isLgScreen={isLgScreen}
          leftPercent={leftPercent}
          onSelectCase={setSelectedCase}
          onCloseCase={closeCase}
          onDeleteCase={handleDeleteCase}
          onOpenFolder={handleOpenFolder}
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

        <OpenCasesDocumentsPanel
          selectedCase={selectedCase}
          documents={documents}
          docsLoading={docsLoading}
          docsError={docsError}
          isLgScreen={isLgScreen}
          leftPercent={leftPercent}
          onOpenFile={handleOpenFile}
          onRemoveDocument={handleRemoveDocument}
          onEditAnnotations={setEditingDoc}
          onShowFields={() => setShowFieldsModal(true)}
          onAddDocument={() => setShowAddDocModal(true)}
        />
      </div>

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

      {/* Modern Confirmation Modal for Case Deletion */}
      {caseToDelete && (
        <OpenCasesCaseDeleteModal
          caseSubject={caseToDelete.subject || "No Subject"}
          onConfirm={confirmDeleteCase}
          onCancel={() => setCaseToDelete(null)}
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
