import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";

import OpenCasesDocumentAnnotationsModal from "./OpenCasesDocumentAnnotationsModal";
import OpenCasesCaseAnnotationsModal from "./OpenCasesCaseAnnotationsModal";
import OpenCasesAddDocumentModal from "./OpenCasesAddDocumentModal";
import OpenCasesUpdateDocumentModal from "./OpenCasesUpdateDocumentModal";
import OpenCasesDocumentDeleteModal from "./OpenCasesDocumentDeleteModal";
import OpenCasesCaseDeleteModal from "./OpenCasesCaseDeleteModal";
import OpenCasesCaseStatusConfirmModal from "./OpenCasesCaseStatusConfirmModal";
import OpenCasesList from "./OpenCasesList";
import OpenCasesDocumentsPanel from "./OpenCasesDocumentsPanel";
import OpenCasesHeader from "./OpenCasesHeader";
import OpenCasesTopBar from "./OpenCasesTopBar";
import { applyCaseSpecialStatus, clearCaseSpecialStatus } from "@/lib/caseSpecialStatus";

import { Case, CaseFile, CaseStatus } from "../CaseManagementTypes";

export default function CaseManagementOpenCases() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<Case[]>([]);
  const [filter, setFilter] = useState<CaseStatus | "all">("open");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);

  // Documents states
  const [documents, setDocuments] = useState<CaseFile[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [editingDoc, setEditingDoc] = useState<CaseFile | null>(null);
  const [editingCaseAnnotations, setEditingCaseAnnotations] = useState<Case | null>(null);
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [updatingAttachment, setUpdatingAttachment] = useState<{ name: string; staged_path: string; size_kb: number } | null>(null);
  const [docToDelete, setDocToDelete] = useState<CaseFile | null>(null);
  const [caseToDelete, setCaseToDelete] = useState<Case | null>(null);
  const [caseToClose, setCaseToClose] = useState<Case | null>(null);

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
        notes: c.notes,
        tags: c.tags || [],
        fields: c.fields ?? {},
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
      await invoke("open_path", { path: filePath });
    } catch (e) {
      console.error("Failed to open file:", e);
      alert(`Failed to open file: ${e}`);
    }
  }

  async function handleOpenFolder(folderPath: string) {
    try {
      await invoke("open_path", { path: folderPath });
    } catch (e) {
      console.error("Failed to open folder:", e);
      alert(`Failed to open folder: ${e}`);
    }
  }

  function applyCaseUpdate(id: string, updater: (c: Case) => Case) {
    setCases((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));
    setSelectedCase((prev) => (prev && prev.id === id ? updater(prev) : prev));
  }

  function handleCloseCase(c: Case) {
    setCaseToClose(c);
  }

  async function confirmCloseCase(notes: string) {
    if (!caseToClose) return;
    const id = caseToClose.id;
    const hasFollowup = caseToClose.tags.some((tg) => tg.name === "followup");
    setCaseToClose(null);
    setError(null);
    try {
      let tags = caseToClose.tags;
      if (hasFollowup) {
        await invoke("remove_tag", { scopeType: "case", scopeValue: id, name: "followup" });
        tags = tags.filter((tg) => tg.name !== "followup");
      }

      const result = await applyCaseSpecialStatus(id, "closed", tags, notes);

      applyCaseUpdate(id, (c) => ({
        ...c,
        status: result.status,
        notes: result.notes,
        tags: result.tags,
      }));
    } catch (err) {
      setError("Failed to close case: " + err);
    }
  }

  async function handleReopenCase(c: Case) {
    setError(null);
    try {
      const result = await clearCaseSpecialStatus(c.id, c.tags);
      applyCaseUpdate(c.id, (prev) => ({
        ...prev,
        status: result.status,
        tags: result.tags,
      }));
    } catch (err) {
      setError("Failed to reopen case: " + err);
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
    if (filter === "followup") {
      return c.tags.some((tg) => tg.name === "followup");
    }
    if (filter !== "all" && c.status !== filter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const subjectMatch = c.subject?.toLowerCase().includes(q) ?? false;
      const nameMatch = c.name?.toLowerCase().includes(q) ?? false;
      const folderMatch = c.folder?.toLowerCase().includes(q) ?? false;
      const idMatch = c.id.toLowerCase().includes(q);
      const notesMatch = c.notes?.toLowerCase().includes(q) ?? false;
      const fieldsMatch = Object.values(c.fields ?? {}).some((value) =>
        value.toLowerCase().includes(q)
      );
      return subjectMatch || nameMatch || folderMatch || idMatch || notesMatch || fieldsMatch;
    }
    return true;
  });

  const followupCount = cases.filter((c) =>
    c.tags.some((tg) => tg.name === "followup")
  ).length;
  const waitingCount = cases.filter((c) => c.status === "waiting").length;

  return (
    <main className="flex-1 overflow-hidden p-6 bg-background flex flex-col h-full">
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
        followupCount={followupCount}
        waitingCount={waitingCount}
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
          onCloseCase={handleCloseCase}
          onReopenCase={handleReopenCase}
          onDeleteCase={handleDeleteCase}
          onOpenFolder={handleOpenFolder}
          onEditCaseAnnotations={setEditingCaseAnnotations}
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
          onEditCaseAnnotations={() => setEditingCaseAnnotations(selectedCase)}
          onAddDocument={() => setShowAddDocModal(true)}
          onCopyAttachmentToCase={setUpdatingAttachment}
          isDetailView={false}
        />
      </div>

      {editingCaseAnnotations && (
        <OpenCasesCaseAnnotationsModal
          caseId={editingCaseAnnotations.id}
          caseSubject={editingCaseAnnotations.subject || "No Subject"}
          initialNotes={editingCaseAnnotations.notes}
          initialTags={editingCaseAnnotations.tags}
          onCancel={() => setEditingCaseAnnotations(null)}
          onTagsChange={(tags) => {
            setCases((prev) =>
              prev.map((c) => (c.id === editingCaseAnnotations.id ? { ...c, tags } : c))
            );
            setSelectedCase((prev) =>
              prev && prev.id === editingCaseAnnotations.id ? { ...prev, tags } : prev
            );
          }}
          onStatusChange={(status) => applyCaseUpdate(editingCaseAnnotations.id, (c) => ({ ...c, status }))}
          onSave={(notes) => {
            setCases((prev) =>
              prev.map((c) => (c.id === editingCaseAnnotations.id ? { ...c, notes } : c))
            );
            setSelectedCase((prev) =>
              prev && prev.id === editingCaseAnnotations.id ? { ...prev, notes } : prev
            );
            setEditingCaseAnnotations(null);
          }}
          onDelete={() => {
            setCases((prev) =>
              prev.map((c) =>
                c.id === editingCaseAnnotations.id
                  ? { ...c, notes: undefined, tags: c.tags.filter((tg) => tg.type === "system") }
                  : c
              )
            );
            setSelectedCase((prev) =>
              prev && prev.id === editingCaseAnnotations.id
                ? { ...prev, notes: undefined, tags: prev.tags.filter((tg) => tg.type === "system") }
                : prev
            );
            setEditingCaseAnnotations(null);
          }}
        />
      )}

      {editingDoc && (
        <OpenCasesDocumentAnnotationsModal
          fileName={editingDoc.name}
          filePath={editingDoc.path}
          initialNotes={editingDoc.notes}
          initialTags={editingDoc.tags}
          onCancel={() => setEditingDoc(null)}
          onTagsChange={(tags) => {
            setDocuments((prev) =>
              prev.map((d) => (d.path === editingDoc.path ? { ...d, tags } : d))
            );
          }}
          onSave={(notes) => {
            setDocuments((prev) =>
              prev.map((d) => (d.path === editingDoc.path ? { ...d, notes } : d))
            );
            setEditingDoc(null);
          }}
          onDelete={() => {
            setDocuments((prev) =>
              prev.map((d) =>
                d.path === editingDoc.path
                  ? { ...d, notes: undefined, tags: d.tags.filter((tg) => tg.type === "system") }
                  : d
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

      {updatingAttachment && selectedCase?.folder && (
        <OpenCasesUpdateDocumentModal
          caseId={Number(selectedCase.id)}
          caseFolder={selectedCase.folder}
          attachment={updatingAttachment}
          existingDocuments={documents}
          onSave={() => {
            setUpdatingAttachment(null);
            if (selectedCase.folder) {
              loadDocuments(selectedCase.folder);
            }
          }}
          onCancel={() => setUpdatingAttachment(null)}
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

      {/* Confirmation Modal for Case Close */}
      {caseToClose && (
        <OpenCasesCaseStatusConfirmModal
          tags={caseToClose.tags}
          title="Close Case"
          message={
            <>
              Are you sure you want to close the case{" "}
              <span className="font-semibold text-foreground/90">"{caseToClose.subject || "No Subject"}"</span>?
            </>
          }
          confirmLabel="Close Case"
          notePlaceholder="Reason for closing, final outcome, etc..."
          initialNotes={caseToClose.notes}
          showFollowupWarning
          icon={
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          }
          onConfirm={confirmCloseCase}
          onCancel={() => setCaseToClose(null)}
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
