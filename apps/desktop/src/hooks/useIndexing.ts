import { useAtom } from "jotai";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";

import type { IndexSummary } from "@/components/DocsManagement/scan/types";
import {
  showOutputAtom,
  isProcessingAtom,
  selectedPathAtom,
  isFolderAtom,
  itemsAtom,
  summaryAtom,
  errorAtom,
} from "../store/indexStore";
import { clearIndexingCancelled, markIndexingCancelled } from "./indexingBridge";

export type { IndexingSession } from "@/components/DocsManagement/scan/types";

export function useIndexing() {
  const navigate = useNavigate();
  const [showOutput, setShowOutput] = useAtom(showOutputAtom);
  const [isProcessing, setIsProcessing] = useAtom(isProcessingAtom);
  const [selectedPath, setSelectedPath] = useAtom(selectedPathAtom);
  const [isFolder, setIsFolder] = useAtom(isFolderAtom);
  const [items, setItems] = useAtom(itemsAtom);
  const [summary, setSummary] = useAtom(summaryAtom);
  const [error, setError] = useAtom(errorAtom);

  const resetState = () => {
    markIndexingCancelled();
    setShowOutput(false);
    setSummary(null);
    setError(null);
    setItems([]);
    setSelectedPath("");
    setIsFolder(false);
    setIsProcessing(false);
  };

  async function startIndexing(
    path: string,
    folder: boolean,
    isContinue: boolean = false,
    startIndex: number = 0,
    reindex: boolean = false,
  ) {
    if (isProcessing) {
      console.log("[useIndexing] Indexing is already running in background. Ignoring duplicate call.");
      return;
    }

    clearIndexingCancelled();

    navigate("/docs-management/scan");
    setShowOutput(true);
    setSelectedPath(path);
    setIsFolder(folder);
    if (!isContinue) {
      setItems([]);
    }
    setSummary(null);
    setError(null);
    setIsProcessing(true);

    try {
      await invoke("prevent_sleep", { keepDisplayOn: false }).catch((err) => {
        console.error("Failed to prevent sleep:", err);
      });
      if (folder) {
        await invoke<IndexSummary>("index_folder", {
          folderPath: path,
          startIndex,
          reindex,
        });
      } else {
        await invoke<IndexSummary>("index_file", {
          filePath: path,
          reindex,
        });
      }
    } catch (e) {
      console.error("[useIndexing] Failed to start indexing:", e);
    } finally {
      await invoke("allow_sleep").catch((err) => {
        console.error("Failed to allow sleep:", err);
      });
    }
  }

  return {
    isProcessing,
    showOutput,
    selectedPath,
    isFolder,
    items,
    summary,
    error,
    startIndexing,
    resetState,
    setSelectedPath,
    setIsFolder,
    setShowOutput,
  };
}
