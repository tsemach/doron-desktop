import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import DocumentAnnotationsModal from "./DocumentAnnotationsModal";
import AddDocumentModal from "./AddDocumentModal";
import CaseFieldsModal from "./CaseFieldsModal";


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

const STATUS_STYLES: Record<CaseStatus, string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "in-progress": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  closed: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

function FileIcon({ ext }: { ext: string }) {
  const normalized = ext.toLowerCase().replace(".", "");
  let bgColor = "bg-slate-100 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400 border-slate-200 dark:border-slate-800";
  let symbol = "📄";
  let label = "FILE";

  if (normalized === "pdf") {
    bgColor = "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400 border-red-200 dark:border-red-900/50";
    symbol = "📕";
    label = "PDF";
  } else if (["docx", "doc"].includes(normalized)) {
    bgColor = "bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 border-blue-200 dark:border-blue-900/50";
    symbol = "📘";
    label = "DOCX";
  } else if (["xlsx", "xls"].includes(normalized)) {
    bgColor = "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50";
    symbol = "📗";
    label = "XLSX";
  } else if (normalized === "txt") {
    bgColor = "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200 dark:border-amber-900/50";
    symbol = "📝";
    label = "TXT";
  }

  return (
    <div className={`w-10 h-10 shrink-0 rounded-lg border ${bgColor} flex flex-col items-center justify-center text-[10px] font-bold shadow-xs select-none`}>
      <span className="text-base leading-none">{symbol}</span>
      <span className="text-[7px] uppercase mt-0.5 tracking-wider font-semibold">{label}</span>
    </div>
  );
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
  const [docSearchQuery, setDocSearchQuery] = useState("");
  const [editingDoc, setEditingDoc] = useState<CaseFile | null>(null);
  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [showFieldsModal, setShowFieldsModal] = useState(false);


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

  async function handleDeleteCase(id: string) {
    if (!confirm("Are you sure you want to delete this case?")) return;
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
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Case Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track active cases, their statuses, and associated documents.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{cases.length} total cases</span>
          <Button onClick={() => navigate("/case-management/new-case")}>+ New Case</Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive shrink-0">
          {error}
        </div>
      )}

      {/* Filters and Search Bar Row */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6 shrink-0">
        {/* Status filters */}
        <div className="flex flex-wrap gap-2">
          {(["all", "open", "in-progress", "closed"] as const).map((s) => (
            <Button
              key={s}
              variant={filter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(s)}
            >
              {s === "all" ? "All" : s === "in-progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative flex items-center w-full sm:w-80">
          <span className="absolute left-3 text-muted-foreground">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search cases by subject, customer, folder..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-input bg-background pl-9 pr-8 py-2 text-sm placeholder:text-muted-foreground/80 focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 text-muted-foreground hover:text-foreground p-1 rounded-sm"
              title="Clear search"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Main split container */}
      <div 
        id="case-management-split-container"
        className={`flex-1 min-h-0 flex ${isLgScreen ? "flex-row gap-0" : "flex-col gap-6"} items-stretch mb-6 relative ${isDragging ? "select-none cursor-col-resize" : ""}`}
      >
        {/* Left Side: Cases List Table */}
        <div 
          style={isLgScreen ? { flex: `0 0 calc(${leftPercent}% - 6px)` } : undefined}
          className="flex flex-col border border-border rounded-xl bg-card overflow-hidden h-full shadow-xs"
        >
          <div className="bg-muted px-4 py-3 border-b border-border font-semibold text-sm text-foreground flex items-center justify-between shrink-0">
            <span>Cases List</span>
            <span className="text-xs text-muted-foreground font-normal">{filtered.length} visible</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
                <div className="animate-spin text-2xl font-bold mb-2">⟳</div>
                <p className="text-sm">Loading cases...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground py-12">
                <p className="text-sm">No cases match your filters.</p>
              </div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead className="bg-muted/40 text-muted-foreground sticky top-0 z-10 border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Case Info</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCase(c)}
                      className={`border-t border-border cursor-pointer transition-all hover:bg-muted/30 ${
                        selectedCase?.id === c.id
                          ? "bg-primary/5 dark:bg-primary/10 border-l-4 border-l-primary font-medium"
                          : ""
                      }`}
                    >
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-foreground leading-snug">{c.subject || "No Subject"}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 font-normal">{c.name}</div>
                        {c.folder && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span 
                              className="text-[10px] text-muted-foreground/75 font-mono truncate max-w-[220px]" 
                              title={c.folder}
                            >
                              {c.folder}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenFolder(c.folder!);
                              }}
                              className="text-muted-foreground hover:text-foreground shrink-0 p-0.5 rounded hover:bg-muted/80 transition-colors"
                              title="Open folder in File Explorer"
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
                              >
                                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 align-middle">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[c.status]}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 align-middle text-xs text-muted-foreground whitespace-nowrap">
                        {c.createdAt}
                      </td>
                      <td className="px-4 py-3.5 text-right align-middle" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end items-center">
                          {c.status !== "closed" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => closeCase(c.id)}
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              title="Close Case"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <circle cx="12" cy="12" r="10" />
                                <path d="m9 12 2 2 4-4" />
                              </svg>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteCase(c.id)}
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Delete Case"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                              <line x1="10" x2="10" y1="11" y2="17" />
                              <line x1="14" x2="14" y1="11" y2="17" />
                            </svg>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Resizable Divider (rendered only on large screens) */}
        {isLgScreen && (
          <div 
            onMouseDown={() => setIsDragging(true)}
            className={`w-3 group cursor-col-resize flex items-center justify-center shrink-0 z-20 select-none ${
              isDragging ? "bg-primary/10" : "hover:bg-primary/5"
            } transition-colors`}
          >
            {/* Grab handle indicator lines */}
            <div className={`w-1 h-12 rounded-full ${
              isDragging ? "bg-primary" : "bg-border/60 group-hover:bg-primary/50"
            } transition-colors`} />
          </div>
        )}

        {/* Right Side: Case Documents Panel */}
        <div 
          style={isLgScreen ? { flex: `0 0 calc(${100 - leftPercent}% - 6px)` } : undefined}
          className="flex flex-col border border-border rounded-xl bg-card overflow-hidden h-full shadow-xs">
          <div className="bg-muted px-4 py-3 border-b border-border font-semibold text-sm text-foreground flex items-center justify-between shrink-0">
            <span>Case Documents</span>
            {selectedCase && documents.length > 0 && (
              <span className="text-xs text-muted-foreground font-normal">{documents.length} file(s)</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {!selectedCase ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8 text-center">
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
                  className="text-muted-foreground/40 mb-3"
                >
                  <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                </svg>
                <p className="text-sm font-semibold">No Case Selected</p>
                <p className="text-xs text-muted-foreground/80 mt-1 max-w-[280px]">
                  Select a case from the list on the left to see its associated documents.
                </p>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {/* Active Case Details Header */}
                <div className="pb-2 border-b border-border/60 flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-foreground leading-snug">{selectedCase.subject || "No Subject"}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Customer: {selectedCase.name}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowFieldsModal(true)}
                      className="text-xs px-3 h-8 gap-1.5 border-border hover:bg-muted"
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
                      >
                        <rect width="18" height="18" x="3" y="3" rx="2" />
                        <path d="M7 8h10" />
                        <path d="M7 12h10" />
                        <path d="M7 16h10" />
                      </svg>
                      Case Fields
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setShowAddDocModal(true)}
                      className="text-xs px-3 h-8 gap-1.5"
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
                      >
                        <path d="M5 12h14" />
                        <path d="M12 5v14" />
                      </svg>
                      Add Document
                    </Button>
                  </div>

                </div>

                {/* Case File Search Bar */}
                {documents.length > 0 && (
                  <div className="relative flex items-center">
                    <span className="absolute left-2.5 text-muted-foreground">
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
                      >
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.3-4.3" />
                      </svg>
                    </span>
                    <input
                      type="text"
                      placeholder="Filter files by name, tags, or notes..."
                      value={docSearchQuery}
                      onChange={(e) => setDocSearchQuery(e.target.value)}
                      className="w-full rounded-lg border border-input bg-background pl-8 pr-7 py-1.5 text-xs placeholder:text-muted-foreground/80 focus:outline-none focus:ring-1 focus:ring-ring transition-all"
                    />
                    {docSearchQuery && (
                      <button
                        onClick={() => setDocSearchQuery("")}
                        className="absolute right-2 text-muted-foreground hover:text-foreground p-0.5"
                        title="Clear filter"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}

                {/* Documents List */}
                <div className="space-y-2">
                  <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-2">
                    Files In Case folder:
                  </div>

                  {docsLoading ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <div className="animate-spin text-xl font-bold mb-1">⟳</div>
                      <p className="text-xs">Loading case files...</p>
                    </div>
                  ) : docsError ? (
                    <div className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-xs text-destructive">
                      <span className="font-bold">Error loading folder files: </span>
                      {docsError}
                    </div>
                  ) : documents.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed border-border rounded-lg text-muted-foreground p-4">
                      <p className="text-xs font-medium">No files found inside the case folder.</p>
                      <p className="text-[10px] text-muted-foreground/80 mt-1">
                        Any Word, PDF, Excel or text documents placed in the directory will show up here.
                      </p>
                    </div>
                  ) : (() => {
                    const filteredDocs = documents.filter((doc) => {
                      if (!docSearchQuery.trim()) return true;
                      const q = docSearchQuery.toLowerCase().trim();
                      const nameMatch = doc.name.toLowerCase().includes(q);
                      const titleMatch = doc.title?.toLowerCase().includes(q) ?? false;
                      const notesMatch = doc.notes?.toLowerCase().includes(q) ?? false;
                      const tagsMatch = doc.tags?.some((t) => t.toLowerCase().includes(q)) ?? false;
                      return nameMatch || titleMatch || notesMatch || tagsMatch;
                    });

                    if (filteredDocs.length === 0) {
                      return (
                        <div className="text-center py-8 border-2 border-dashed border-border rounded-lg text-muted-foreground p-4">
                          <p className="text-xs font-medium">No files match the filter query.</p>
                          <p className="text-[10px] text-muted-foreground/80 mt-1">
                            Try clearing the search query or search for something else.
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div className="grid grid-cols-1 gap-2.5">
                        {filteredDocs.map((doc) => (
                          <div
                            key={doc.path}
                            onClick={() => handleOpenFile(doc.path)}
                            className="rounded-lg border border-border bg-card p-3 hover:shadow-xs hover:border-primary/40 dark:hover:border-primary/45 transition-all duration-150 flex items-center justify-between gap-4 group cursor-pointer"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {/* Visual file-type icon */}
                              <FileIcon ext={doc.ext} />
                              <div className="min-w-0 flex-1">
                                <h4 className="font-semibold text-xs text-foreground truncate group-hover:text-primary transition-colors pr-2 leading-tight" title={doc.title || doc.name}>
                                  {doc.title || doc.name}
                                </h4>
                                <p className="text-[10px] text-muted-foreground mt-1.5 font-mono truncate" title={doc.title ? doc.name : undefined}>
                                  {doc.title ? `${doc.name} • ` : ""}{doc.size_kb} KB • .{doc.ext.toUpperCase()}
                                </p>

                                {/* Render tags if any */}
                                {doc.tags && doc.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {doc.tags.map((tag) => (
                                      <span
                                        key={tag}
                                        className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-semibold border border-primary/20 tracking-wide uppercase select-none"
                                      >
                                        #{tag}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Render notes if any */}
                                {doc.notes && (
                                  <p className="text-[10px] text-muted-foreground/80 mt-1.5 italic line-clamp-2 border-l-2 border-border/85 pl-1.5 bg-muted/20 py-0.5 rounded-r">
                                    "{doc.notes}"
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditingDoc(doc)}
                                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-primary/5"
                                title="Edit notes & tags"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M12 2H2v10l9.29 9.29c.39.39 1.02.39 1.41 0l8.59-8.59c.39-.39.39-1.02 0-1.41L12 2z" />
                                  <path d="M7 7h.01" />
                                </svg>
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenFile(doc.path)}
                                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-primary/5"
                                title={`Open file in system default viewer`}
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M15 3h6v6" />
                                  <path d="M10 14 21 3" />
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                </svg>
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {editingDoc && (
        <DocumentAnnotationsModal
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
        <AddDocumentModal
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
        <CaseFieldsModal
          caseId={Number(selectedCase.id)}
          caseName={selectedCase.name}
          onClose={() => setShowFieldsModal(false)}
        />
      )}

    </main>
  );
}
