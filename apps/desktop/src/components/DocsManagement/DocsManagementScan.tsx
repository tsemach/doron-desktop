import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import DocsManagementScanHeader from "./DocsManagementScanHeader";
import DocsManagementScanMenu from "./DocsManagementScanMenu";
import DocsManagementScanConfirm from "./DocsManagementScanConfirm";
import DocsManagementScanProcessing from "./DocsManagementScanProcessing";

export type ProgressStatus = "processing" | "ok" | "skipped" | "failed";

export type ProgressItem = {
  file_name: string;
  status: ProgressStatus;
  message: string;
  current: number;
  total: number;
};

export type IndexSummary = {
  indexed: number;
  skipped: number;
  failed: number;
};



export interface IndexingSession {
  path: string;
  is_folder: boolean;
  reindex: boolean;
  start_index: number;
  total_files: number;
  status: string;
  updated_at: string;
}

type Props = {
  show: boolean;
  isFolder: boolean;
  isProcessing: boolean;
  selectedPath: string;
  items: ProgressItem[];
  currentItem: ProgressItem | undefined;
  summary: IndexSummary | null;
  error: string | null;
  startIndexing: (path: string, isFolder: boolean, isContinue?: boolean, startIndex?: number, reindex?: boolean) => void;
  resetState?: () => void;
  setSelectedPath: (path: string) => void;
  setIsFolder: (isFolder: boolean) => void;
  setShowOutput: (show: boolean) => void;
};

export default function DocsManagementScan({
  show,
  isFolder,
  isProcessing,
  selectedPath,
  items,
  currentItem,
  summary,
  error,
  startIndexing,
  resetState,
  setSelectedPath,
  setIsFolder,
  setShowOutput,
}: Props) {
  const [reindex, setReindex] = useState(false);
  const [activeSession, setActiveSession] = useState<IndexingSession | null>(null);

  useEffect(() => {
    // When entering the Scan & Index page, default to showing the cards/main selection view
    setShowOutput(false);
  }, [setShowOutput]);

  useEffect(() => {
    async function checkActiveSession() {
      try {
        const sessions = await invoke<IndexingSession[]>("get_active_indexing_sessions");
        const active = sessions.filter((s) => s.total_files === 0 || s.start_index < s.total_files);
        if (active.length > 0) {
          active.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          setActiveSession(active[0]);
        } else {
          setActiveSession(null);
        }
      } catch (err) {
        console.error("Failed to check active indexing sessions in scan view:", err);
      }
    }
    checkActiveSession();
  }, [isProcessing]);

  function handleOpenActiveSession() {
    if (!activeSession) return;
    
    setSelectedPath(activeSession.path);
    setIsFolder(activeSession.is_folder);
    setShowOutput(true);
  }

  const actualItemsCount = items.filter((i) => i.file_name !== "").length;

  const currentCount = actualItemsCount;

  const totalCount = isProcessing && currentItem
    ? currentItem.total
    : (items[0]?.total || actualItemsCount);

  const progressPercent = totalCount > 0
    ? Math.round((currentCount / totalCount) * 100)
    : 0;

  async function handleStopIndexing() {
    try {
      await invoke("stop_indexing");
    } catch (err) {
      console.error("Error stopping indexing:", err);
    }
  }

  async function executeCancelIndexing() {
    try {
      // 1. Immediately clear the local state to unlock the UI instantly
      setActiveSession(null);
      
      // 2. Stop active indexing thread
      if (isProcessing) {
        await invoke("stop_indexing");
      }
      
      // 3. Delete the session from the database
      if (selectedPath) {
        await invoke("delete_indexing_session", { path: selectedPath });
      }
      
      // 4. Reset all Jotai indexing atoms
      if (resetState) {
        resetState();
      }

      // 5. Perform a final query to ensure the UI is fully in sync with the database
      const sessions = await invoke<IndexingSession[]>("get_active_indexing_sessions");
      const active = sessions.filter((s) => s.total_files === 0 || s.start_index < s.total_files);
      if (active.length > 0) {
        active.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        setActiveSession(active[0]);
      } else {
        setActiveSession(null);
      }
    } catch (err) {
      console.error("Error cancelling indexing:", err);
    }
  }

  async function handleSelectFile() {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Documents", extensions: ["docx", "pdf", "xlsx", "xls", "txt"] }],
      });
      if (selected && typeof selected === "string") {
        setSelectedPath(selected);
        setIsFolder(false);
      }
    } catch (err) {
      console.error("Error choosing file:", err);
    }
  }

  async function handleSelectFolder() {
    try {
      const selected = await open({ directory: true });
      if (selected && typeof selected === "string") {
        setSelectedPath(selected);
        setIsFolder(true);
      }
    } catch (err) {
      console.error("Error choosing folder:", err);
    }
  }

  // --- FILE/FOLDER SELECTED STATE VIEW (Before starting scan) ---
  if (!isProcessing && !show && !summary && selectedPath) {
    return (
      <DocsManagementScanConfirm
        selectedPath={selectedPath}
        isFolder={isFolder}
        reindex={reindex}
        setReindex={setReindex}
        onCancel={resetState}
        onStart={() => startIndexing(selectedPath, isFolder, false, 0, reindex)}
      />
    );
  }

  // --- IDLE STATE VIEW ---
  if (!show && !summary) {
    const isDisabled = !!activeSession || isProcessing;
    const isFolderActive = activeSession ? activeSession.is_folder : false;

    return (
      <div className="max-w-4xl mx-auto space-y-8 py-4 animate-fade-in-down">
        <DocsManagementScanHeader />

        <DocsManagementScanMenu
          isDisabled={isDisabled}
          isFolderActive={isFolderActive}
          activeSession={activeSession}
          onSelectFolder={handleSelectFolder}
          onSelectFile={handleSelectFile}
          onOpenActiveSession={handleOpenActiveSession}
        />
      </div>
    );
  }

  // --- PROCESSING / STATUS STATE VIEW ---
  return (
    <DocsManagementScanProcessing
      isFolder={isFolder}
      selectedPath={selectedPath}
      isProcessing={isProcessing}
      items={items}
      currentCount={currentCount}
      totalCount={totalCount}
      handleStopIndexing={handleStopIndexing}
      onCancelIndexing={executeCancelIndexing}
      summary={summary}
      startIndexing={startIndexing}
      progressPercent={progressPercent}
      currentItem={currentItem}
      error={error}
      resetState={resetState}
    />
  );
}
