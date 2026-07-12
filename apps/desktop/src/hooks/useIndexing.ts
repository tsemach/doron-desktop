import { useAtom, useAtomValue } from "jotai";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { API_KEY_STORAGE_KEY } from "../components/Settings/Settings";
import { aiConfigAtom } from "../store/aiStore";
import {
  showOutputAtom,
  isProcessingAtom,
  selectedPathAtom,
  isFolderAtom,
  itemsAtom,
  summaryAtom,
  errorAtom,
} from "../store/indexStore";
import { type ProgressItem, type ProgressStatus, type IndexSummary } from "../components/DocsManagement/DocsManagementScan";

export type IndexProgressEvent = {
  file_name: string;
  status: string;
  message: string;
  current: number;
  total: number;
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

// Global variables to persist across mount/unmount lifecycles
let globalUnlisten: UnlistenFn | null = null;
let globalIsCancelled = false;

export function useIndexing() {
  const navigate = useNavigate();
  const [showOutput, setShowOutput] = useAtom(showOutputAtom);
  const [isProcessing, setIsProcessing] = useAtom(isProcessingAtom);
  const [selectedPath, setSelectedPath] = useAtom(selectedPathAtom);
  const [isFolder, setIsFolder] = useAtom(isFolderAtom);
  const [items, setItems] = useAtom(itemsAtom);
  const [summary, setSummary] = useAtom(summaryAtom);
  const [error, setError] = useAtom(errorAtom);
  const aiConfig = useAtomValue(aiConfigAtom);
  const aiMode = aiConfig?.aiMode ?? "";

  const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";

  const resetState = () => {
    globalIsCancelled = true;
    setShowOutput(false);
    setSummary(null);
    setError(null);
    setItems([]);
    setSelectedPath("");
    setIsFolder(false);
    setIsProcessing(false);
    globalUnlisten?.();
    globalUnlisten = null;
  };

  async function startIndexing(
    path: string,
    folder: boolean,
    isContinue: boolean = false,
    startIndex: number = 0,
    reindex: boolean = false,
    autoResume: boolean = false
  ) {
    if (isProcessing) {
      console.log("[useIndexing] Indexing is already running in background. Ignoring duplicate call.");
      return;
    }

    globalIsCancelled = false;
    console.log("startIndexing called", { path, folder, isContinue, startIndex, reindex, autoResume });

    if (!autoResume) {
      navigate("/docs-management/scan");
      setShowOutput(true);
    } else {
      setShowOutput(false);
    }
    setSelectedPath(path);
    setIsFolder(folder);
    if (!isContinue) {
      setItems([]);
    }
    setSummary(null);
    setError(null);
    setIsProcessing(true);

    globalUnlisten = await listen<IndexProgressEvent>("indexing-progress", (event) => {
      const { file_name, status, message, current, total } = event.payload;
      console.log("indexing-progress event payload:", event.payload);
      if (!file_name || file_name.trim() === "" || message === "Indexing stopped by user") {
        return;
      }
      setItems((prev) => {
        const idx = prev.findIndex((p) => p.file_name === file_name);
        if (idx !== -1 && prev[idx].status === "ok" && status === "skipped") {
          const next = [...prev];
          next[idx] = {
            ...prev[idx],
            current,
            total,
          };
          return next;
        }
        const item: ProgressItem = {
          file_name,
          status: status as ProgressStatus,
          message,
          current,
          total,
        };
        if (idx === -1) return [...prev, item];
        const next = [...prev];
        next[idx] = item;
        return next;
      });
    });

    try {
      await invoke("prevent_sleep", { keepDisplayOn: false }).catch((err) => {
        console.error("Failed to prevent sleep:", err);
      });
      const result = folder
        ? await invoke<IndexSummary>("index_folder", { folderPath: path, apiKey, startIndex, reindex })
        : await invoke<IndexSummary>("index_file", { filePath: path, apiKey, reindex });
      if (globalIsCancelled) {
        console.log("[useIndexing] Await completed, but session was cancelled. Ignoring result.");
        return;
      }
      setSummary(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
      globalUnlisten?.();
      globalUnlisten = null;
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
