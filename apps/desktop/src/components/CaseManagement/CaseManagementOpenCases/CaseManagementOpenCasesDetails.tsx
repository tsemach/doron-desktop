import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import OpenCasesDocumentAnnotationsModal from "./OpenCasesDocumentAnnotationsModal";
import OpenCasesCaseAnnotationsModal from "./OpenCasesCaseAnnotationsModal";
import OpenCasesAddDocumentModal from "./OpenCasesAddDocumentModal";
import OpenCasesUpdateDocumentModal from "./OpenCasesUpdateDocumentModal";
import OpenCasesDocumentDeleteModal from "./OpenCasesDocumentDeleteModal";
import OpenCasesDocumentsPanel from "./OpenCasesDocumentsPanel";
import CaseEmailsChat from "./OpenCasesEmailsChat";
import OpenCasesDocumentPreview from "./OpenCasesDocumentPreview";
import OpenCasesDocumentHistory from "./OpenCasesDocumentHistory";
import OpenCasesDocumentFields from "./OpenCasesDocumentFields";
import mammoth from "mammoth";
import { useLanguage } from "../../../context/LanguageContext";

import { Case, CaseFile, CaseStatus } from "../CaseManagementTypes";

export default function CaseManagementOpenCasesDetails() {
  const { caseId } = useParams<{ caseId: string }>();
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const { t } = useLanguage();

  // Documents states
  const [documents, setDocuments] = useState<CaseFile[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [editingDoc, setEditingDoc] = useState<CaseFile | null>(null);
  const [editingCaseAnnotations, setEditingCaseAnnotations] = useState<Case | null>(null);
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [updatingAttachment, setUpdatingAttachment] = useState<{ name: string; staged_path: string; size_kb: number } | null>(null);
  const [docToDelete, setDocToDelete] = useState<CaseFile | null>(null);
  const [attachmentToDelete, setAttachmentToDelete] = useState<{ name: string; staged_path: string; size_kb: number } | null>(null);

  // Right side panel tab state
  const [activeRightTab, setActiveRightTab] = useState<"preview" | "emails">("preview");
  const [docSubTab, setDocSubTab] = useState<"preview" | "history" | "fields">("preview");

  // Document preview states
  const [selectedDocument, setSelectedDocument] = useState<CaseFile | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);

  // General loading/error
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Email attachments state
  const [attachments, setAttachments] = useState<{ name: string; staged_path: string; size_kb: number }[]>([]);

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

  // Fetch documents and attachments when selected case changes
  useEffect(() => {
    if (selectedCase?.folder) {
      loadDocuments(selectedCase.folder);
    } else {
      setDocuments([]);
    }

    if (selectedCase?.id) {
      loadAttachments(Number(selectedCase.id));
    } else {
      setAttachments([]);
    }
  }, [selectedCase?.id, selectedCase?.folder]);

  // Listen for email updates to refresh attachments list
  useEffect(() => {
    if (!selectedCase?.id) return;

    const unlisten = listen("case-emails-updated", (event) => {
      const updatedCaseId = event.payload as number;
      if (updatedCaseId === Number(selectedCase.id)) {
        loadAttachments(Number(selectedCase.id));
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [selectedCase?.id]);

  // Start and stop folder watcher for active case
  useEffect(() => {
    if (selectedCase?.id && selectedCase?.folder) {
      invoke("start_case_watcher", {
        caseId: Number(selectedCase.id),
        folderPath: selectedCase.folder,
      }).catch((e) => console.error("Failed to start case watcher:", e));
    }
    return () => {
      invoke("stop_case_watcher").catch((e) => console.error("Failed to stop case watcher:", e));
    };
  }, [selectedCase?.id, selectedCase?.folder]);

  // Listen for file change notifications to reload case documents
  useEffect(() => {
    if (!selectedCase?.folder) return;

    const unlistenPromise = listen("case-files-changed", () => {
      loadDocuments(selectedCase.folder!);
    });

    return () => {
      unlistenPromise.then((f) => f());
    };
  }, [selectedCase?.folder]);

  async function loadAttachments(cId: number) {
    try {
      const atts = await invoke<any[]>("list_case_attachments", { caseId: cId });
      setAttachments(atts);
    } catch (err) {
      console.error("Failed to load case attachments:", err);
    }
  }

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
        notes: c.notes,
        tags: c.tags || [],
        followupDate: c.followup_date,
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
      // Sync selected document state with fresh database records
      setSelectedDocument((current) => {
        if (!current) return null;
        const fresh = files.find((f) => f.path === current.path);
        return fresh || null;
      });
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

  async function confirmRemoveAttachment() {
    if (!attachmentToDelete || !selectedCase) return;
    const att = attachmentToDelete;
    setAttachmentToDelete(null);

    setDocsLoading(true);
    setDocsError(null);
    try {
      await invoke("remove_attachment", {
        caseId: Number(selectedCase.id),
        stagedPath: att.staged_path,
        importedPath: null,
      });

      // Reload attachments list
      await loadAttachments(Number(selectedCase.id));
    } catch (err) {
      console.error(err);
      setDocsError(String(err));
    } finally {
      setDocsLoading(false);
    }
  }

  return (
    <main className="flex-1 overflow-hidden p-6 bg-background flex flex-col h-full">
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
          unicode-bidi: plaintext;
          text-align: start;
        }
        .docx-content-view h2 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 1.2rem;
          margin-bottom: 0.5rem;
          color: var(--foreground);
          unicode-bidi: plaintext;
          text-align: start;
        }
        .docx-content-view h3 {
          font-size: 1.1rem;
          font-weight: 600;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
          color: var(--foreground);
          unicode-bidi: plaintext;
          text-align: start;
        }
        .docx-content-view p {
          margin-bottom: 0.75rem;
          line-height: 1.6;
          unicode-bidi: plaintext;
          text-align: start;
        }
        .docx-content-view ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
          unicode-bidi: plaintext;
        }
        .docx-content-view ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
          margin-bottom: 0.75rem;
          unicode-bidi: plaintext;
        }
        .docx-content-view li {
          margin-bottom: 0.25rem;
          unicode-bidi: plaintext;
          text-align: start;
        }
        .docx-content-view table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 1rem;
          margin-bottom: 1rem;
          font-size: 0.85rem;
          unicode-bidi: plaintext;
        }
        .docx-content-view th, .docx-content-view td {
          border: 1px solid var(--border);
          padding: 0.5rem 0.75rem;
          text-align: inherit;
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
          unicode-bidi: plaintext;
          text-align: start;
        }
      `}</style>

      {/* Header with back button */}
      <div className="flex items-center gap-3 mb-6 shrink-0">
        <Link
          to="/case-management"
          className="p-2 hover:bg-muted rounded-lg transition-colors border border-border shrink-0"
          title={t("back_to_open_cases")}
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
            className="rtl:rotate-180"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("case_management")}</span>
            <span className="text-muted-foreground/60 text-xs">/</span>
            <span className="text-sm font-medium text-foreground">{t("case_detail")}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-1">
            {selectedCase?.subject || t("loading_case_details")}
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
          <p className="text-sm">{t("loading_case_details")}</p>
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
            onEditCaseAnnotations={() => setEditingCaseAnnotations(selectedCase)}
            onAddDocument={() => setShowAddDocModal(true)}
            onSelectDocument={(doc) => {
              setSelectedDocument(doc);
              setActiveRightTab("preview");
            }}
            selectedDocument={selectedDocument}
            activeRightTab={activeRightTab}
            onTabChange={setActiveRightTab}
            attachments={attachments}
            onRemoveAttachment={(att) => setAttachmentToDelete(att)}
            onCopyAttachmentToCase={setUpdatingAttachment}
            isDetailView={true}
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

          {/* Right side: Document Previewer & Emails Workspace */}
          <div
            style={isLgScreen ? { flex: `0 0 calc(${100 - leftPercent}% - 6px)` } : undefined}
            className={`flex flex-col border border-border rounded-xl bg-card overflow-hidden min-h-0 flex-1 ${isLgScreen ? "h-full" : ""} shadow-xs`}
          >
            <div className="bg-muted px-4 py-3 border-b border-border font-semibold text-sm text-foreground flex items-center justify-between shrink-0">
              <span>
                {activeRightTab === "emails"
                  ? (t("emails_exchange") || "Case Email Correspondence")
                  : (t("document_preview") || "Document Preview")}
              </span>
              {activeRightTab === "preview" && selectedDocument && (
                <span className="text-xs text-muted-foreground font-mono font-normal truncate max-w-[200px] align-middle" title={selectedDocument.name}>
                  {selectedDocument.name}
                </span>
              )}
            </div>

            {/* Sub-tabs for Preview vs Version History */}
            {activeRightTab === "preview" && selectedDocument && (
              <div className="flex border-b border-border bg-muted/20 px-4 py-1.5 shrink-0 gap-4 select-none">
                <button
                  onClick={() => setDocSubTab("preview")}
                  className={`text-xs font-semibold pb-1 border-b-2 px-1 transition-all focus:outline-none focus:ring-0 cursor-pointer ${
                    docSubTab === "preview"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Preview
                </button>
                <button
                  onClick={() => setDocSubTab("history")}
                  className={`text-xs font-semibold pb-1 border-b-2 px-1 transition-all focus:outline-none focus:ring-0 cursor-pointer ${
                    docSubTab === "history"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Version History
                </button>
                <button
                  onClick={() => setDocSubTab("fields")}
                  className={`text-xs font-semibold pb-1 border-b-2 px-1 transition-all focus:outline-none focus:ring-0 cursor-pointer ${
                    docSubTab === "fields"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("document_fields") || "Document fields"}
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto bg-background/50 dark:bg-background/20 relative flex flex-col min-h-0">
              {activeRightTab === "emails" ? (
                <CaseEmailsChat 
                  caseId={Number(selectedCase?.id || 0)} 
                  caseFolder={selectedCase?.folder || ""} 
                />
              ) : docSubTab === "history" && selectedDocument ? (
                <OpenCasesDocumentHistory
                  selectedDocument={selectedDocument}
                  onRestore={() => {
                    if (selectedCase?.folder) {
                      loadDocuments(selectedCase.folder);
                    }
                    setDocSubTab("preview"); // Switch back to preview
                  }}
                />
              ) : docSubTab === "fields" && selectedDocument ? (
                <OpenCasesDocumentFields
                  selectedDocument={selectedDocument}
                  caseId={Number(selectedCase?.id || 0)}
                  onSaved={() => {
                    if (selectedCase?.folder) {
                      loadDocuments(selectedCase.folder);
                    }
                    setDocSubTab("preview");
                  }}
                  onCancel={() => {
                    setDocSubTab("preview");
                  }}
                />
              ) : (
                <OpenCasesDocumentPreview
                  selectedDocument={selectedDocument}
                  previewLoading={previewLoading}
                  previewError={previewError}
                  previewHtml={previewHtml}
                  previewText={previewText}
                  onOpenFile={handleOpenFile}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {editingCaseAnnotations && (
        <OpenCasesCaseAnnotationsModal
          caseId={editingCaseAnnotations.id}
          caseSubject={editingCaseAnnotations.subject || "No Subject"}
          initialNotes={editingCaseAnnotations.notes}
          initialTags={editingCaseAnnotations.tags}
          initialFollowupDate={editingCaseAnnotations.followupDate}
          onCancel={() => setEditingCaseAnnotations(null)}
          onSave={(notes, tags, followupDate) => {
            setSelectedCase((prev) =>
              prev && prev.id === editingCaseAnnotations.id ? { ...prev, notes, tags, followupDate } : prev
            );
            setEditingCaseAnnotations(null);
          }}
          onDelete={() => {
            setSelectedCase((prev) =>
              prev && prev.id === editingCaseAnnotations.id ? { ...prev, notes: undefined, tags: [], followupDate: undefined } : prev
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
            if (selectedCase.id) {
              loadAttachments(Number(selectedCase.id));
            }
          }}
          onCancel={() => setUpdatingAttachment(null)}
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

      {attachmentToDelete && (
        <OpenCasesDocumentDeleteModal
          docName={attachmentToDelete.name}
          onConfirm={confirmRemoveAttachment}
          onCancel={() => setAttachmentToDelete(null)}
        />
      )}
    </main>
  );
}
