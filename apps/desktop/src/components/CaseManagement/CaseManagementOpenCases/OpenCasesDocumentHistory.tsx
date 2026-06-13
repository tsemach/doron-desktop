import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Loader2, FolderOpen, RotateCcw, Trash2, CheckCircle2 } from "lucide-react";

import { CaseFile } from "../CaseManagementTypes";

interface DocumentVersion {
  id: number;
  case_id: number;
  active_path: string;
  version_path: string;
  version_name: string;
  size_kb: number;
  created_at: string;
  notes: string | null;
  md5_hash: string;
}

interface OpenCasesDocumentHistoryProps {
  selectedDocument: CaseFile;
  onRestore: () => void;
}

export default function OpenCasesDocumentHistory({
  selectedDocument,
  onRestore,
}: OpenCasesDocumentHistoryProps) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    loadVersions();

    // Listen to changes in the case folder (like auto-saves) to refresh list
    let unlistenFn: (() => void) | null = null;
    const listenPromise = listen("case-files-changed", () => {
      loadVersions();
    });

    listenPromise.then((unsubs) => {
      unlistenFn = unsubs;
    });

    return () => {
      listenPromise.then(() => {
        if (unlistenFn) unlistenFn();
      });
    };
  }, [selectedDocument.path]);

  async function loadVersions() {
    setLoading(true);
    setError(null);
    try {
      const res = await invoke<DocumentVersion[]>("list_document_versions", {
        filePath: selectedDocument.path,
      });
      setVersions(res || []);
    } catch (e) {
      console.error("Failed to load document versions:", e);
      setError("Failed to load version history.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOpenVersion(version: DocumentVersion) {
    try {
      await invoke("open_template_file", { path: version.version_path });
    } catch (e) {
      console.error("Failed to open version file:", e);
      alert(`Failed to open version file: ${e}`);
    }
  }

  async function handleRestoreVersion(version: DocumentVersion) {
    if (
      !confirm(
        `Are you sure you want to restore "${version.version_name}"? This will replace the active file, and create a backup of your current content first.`
      )
    ) {
      return;
    }

    setRestoringId(version.id);
    try {
      await invoke("restore_document_version", { versionId: version.id });
      onRestore(); // trigger documents reload in parent
    } catch (e) {
      console.error("Failed to restore version:", e);
      alert(`Failed to restore version: ${e}`);
    } finally {
      setRestoringId(null);
    }
  }

  async function handleDeleteVersion(version: DocumentVersion) {
    if (!confirm("Are you sure you want to permanently delete this archived version from disk?")) {
      return;
    }

    setDeletingId(version.id);
    try {
      await invoke("delete_document_version", { versionId: version.id });
      setVersions((prev) => prev.filter((v) => v.id !== version.id));
    } catch (e) {
      console.error("Failed to delete version:", e);
      alert(`Failed to delete version: ${e}`);
    } finally {
      setDeletingId(null);
    }
  }

  function formatTimestamp(rfc3339: string) {
    try {
      const date = new Date(rfc3339);
      return date.toLocaleString();
    } catch {
      return rfc3339;
    }
  }

  return (
    <div className="flex-grow flex flex-col min-h-0 bg-background/50 relative">
      <div className="p-6 flex-1 flex flex-col min-h-0 overflow-y-auto">
        {error && (
          <div className="mb-4 rounded-md border border-destructive bg-destructive/10 px-4 py-2.5 text-xs text-destructive shrink-0">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex-grow flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="animate-spin h-8 w-8 mb-2" />
            <p className="text-sm">Fetching document history...</p>
          </div>
        ) : versions.length === 0 ? (
          <div className="flex-grow flex flex-col items-center justify-center p-8 text-center text-muted-foreground max-w-md mx-auto">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground/50 text-lg">
              ⏱️
            </div>
            <p className="text-sm font-semibold text-foreground">No Historical Versions</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[280px]">
              Editing this file in Word or replacing it will automatically create backup versions here.
            </p>
          </div>
        ) : (
          <div className="space-y-4 flex flex-col min-h-0 flex-grow">
            {/* Timeline Header Card */}
            <div className="border border-border/80 bg-card rounded-lg p-4 flex items-center gap-3 shrink-0">
              <div className="bg-primary/10 text-primary rounded-full p-2">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Active File Status</h4>
                <p className="text-xs text-foreground font-semibold mt-0.5 truncate" title={selectedDocument.name}>
                  {selectedDocument.name}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                  Size: {selectedDocument.size_kb} KB
                </p>
              </div>
            </div>

            {/* Timeline List */}
            <div className="space-y-3.5 pl-1.5 relative border-l border-border/85 ml-3.5 py-1 flex-1">
              {versions.map((ver, idx) => (
                <div key={ver.id} className="relative pl-6 group">
                  {/* Timeline point */}
                  <div className="absolute -left-[27px] top-1.5 w-3 h-3 rounded-full bg-background border-2 border-primary group-hover:bg-primary transition-colors z-10" />

                  <div className="border border-border/60 hover:border-primary/45 rounded-lg bg-card p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all hover:shadow-xs">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-foreground">
                          Version #{versions.length - 1 - idx}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-medium bg-muted px-2 py-0.5 rounded-full border border-border">
                          {formatTimestamp(ver.created_at)}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono bg-muted/30 px-1.5 py-0.5 rounded border border-border/50">
                          {ver.size_kb} KB
                        </span>
                      </div>
                      
                      <p className="text-[10px] text-muted-foreground truncate font-mono mt-1" title={ver.version_name}>
                        File: {ver.version_name}
                      </p>

                      {ver.notes && (
                        <p className="text-xs text-foreground bg-muted/40 p-2 rounded border border-border/40 mt-2 italic">
                          "{ver.notes}"
                        </p>
                      )}

                      <p className="text-[9px] text-muted-foreground/75 font-mono mt-1">
                        MD5: <span className="select-all bg-muted/10 px-1 py-0.5 rounded font-bold border border-border/30">{ver.md5_hash.slice(0, 10)}...</span>
                      </p>
                    </div>

                    <div className="flex gap-2 shrink-0 select-none">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenVersion(ver)}
                        disabled={restoringId !== null || deletingId !== null}
                        className="text-xs h-8 px-2.5 gap-1.5"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        Open
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleRestoreVersion(ver)}
                        disabled={restoringId !== null || deletingId !== null}
                        className="text-xs h-8 px-2.5 gap-1.5"
                      >
                        {restoringId === ver.id ? (
                          <Loader2 className="animate-spin h-3.5 w-3.5" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteVersion(ver)}
                        disabled={restoringId !== null || deletingId !== null}
                        className="text-xs h-8 px-2 hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                      >
                        {deletingId === ver.id ? (
                          <Loader2 className="animate-spin h-3.5 w-3.5" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
