import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { pickIndexableDocumentFile, pickIndexableDocumentFolder } from "@/lib/indexing";
import { fetchLatestActiveIndexingSession, useActiveIndexingSession } from "./activeSession";
import ScanConfirm from "./ScanConfirm";
import ScanHeader from "./ScanHeader";
import ScanMenu from "./ScanMenu";
import ScanProcessing from "./ScanProcessing";
import type { IndexSummary, ProgressItem } from "./types";

type ScanProps = {
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

export default function Scan({
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
}: ScanProps) {
  const [reindex, setReindex] = useState(false);
  const { activeSession, setActiveSession } = useActiveIndexingSession(isProcessing);

  const isConfirmView =
    !isProcessing && !summary && !!selectedPath && items.length === 0 && !show;

  const showResultsView =
    isProcessing ||
    !!summary ||
    show ||
    (items.length > 0 && !!selectedPath && !isConfirmView);

  const matchingSession = activeSession?.path === selectedPath ? activeSession : null;
  const resumeInfo = matchingSession
    ? { startIndex: matchingSession.start_index, reindex: matchingSession.reindex }
    : null;

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
      setActiveSession(null);

      if (isProcessing) {
        await invoke("stop_indexing");
      }

      if (selectedPath) {
        await invoke("delete_indexing_session", { path: selectedPath });
      }

      if (resetState) {
        resetState();
      }

      const latestSession = await fetchLatestActiveIndexingSession();
      setActiveSession(latestSession);
    } catch (err) {
      console.error("Error cancelling indexing:", err);
    }
  }

  async function handleSelectFile() {
    try {
      const selected = await pickIndexableDocumentFile();
      if (selected) {
        setSelectedPath(selected);
        setIsFolder(false);
      }
    } catch (err) {
      console.error("Error choosing file:", err);
    }
  }

  async function handleSelectFolder() {
    try {
      const selected = await pickIndexableDocumentFolder();
      if (selected) {
        setSelectedPath(selected);
        setIsFolder(true);
      }
    } catch (err) {
      console.error("Error choosing folder:", err);
    }
  }

  if (isConfirmView) {
    return (
      <ScanConfirm
        selectedPath={selectedPath}
        isFolder={isFolder}
        reindex={reindex}
        setReindex={setReindex}
        onCancel={resetState}
        onStart={() => startIndexing(selectedPath, isFolder, false, 0, reindex)}
      />
    );
  }

  if (!showResultsView) {
    const isDisabled = !!activeSession || isProcessing;
    const isFolderActive = activeSession ? activeSession.is_folder : false;

    return (
      <div className="max-w-4xl mx-auto space-y-8 py-4 animate-fade-in-down">
        <ScanHeader />

        <ScanMenu
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

  return (
    <ScanProcessing
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
      resumeInfo={resumeInfo}
      resetState={resetState}
    />
  );
}
