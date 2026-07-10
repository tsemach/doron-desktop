import { useEffect } from "react";
import { useNavigate, Routes, Route } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { API_KEY_STORAGE_KEY } from "../Settings/Settings";
import CheckApiKey from "../ui/check-api-key";
import DocsManagementHeader from "./DocsManagementHeader";
import DocsManagementScan, { type ProgressItem, type ProgressStatus, type IndexSummary } from "./DocsManagementScan";
import DocsManagementTemplates from "./DocsManagementTemplates/DocsManagementTemplates";
import DocsManagementSearch from "./DocsManagementSearch";
import { useAtom, useAtomValue } from "jotai";
import { aiConfigAtom, aiConfigStatusAtom } from "../../store/aiStore";
import {
  showOutputAtom,
  isProcessingAtom,
  selectedPathAtom,
  isFolderAtom,
  itemsAtom,
  summaryAtom,
  errorAtom,
  dbPathAtom,
} from "../../store/indexStore";

type IndexProgressEvent = {
  file_name: string;
  status: string;
  message: string;
  current: number;
  total: number;
};

// Global variables to persist across mount/unmount lifecycles
let globalUnlisten: UnlistenFn | null = null;
let globalIsCancelled = false;

export default function DocsManagement() {
  const navigate = useNavigate();
  const [showOutput, setShowOutput] = useAtom(showOutputAtom);
  const [isProcessing, setIsProcessing] = useAtom(isProcessingAtom);
  const [selectedPath, setSelectedPath] = useAtom(selectedPathAtom);
  const [isFolder, setIsFolder] = useAtom(isFolderAtom);
  const [items, setItems] = useAtom(itemsAtom);
  const [summary, setSummary] = useAtom(summaryAtom);
  const [error, setError] = useAtom(errorAtom);
  const [dbPath, setDbPath] = useAtom(dbPathAtom);

  const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
  const [aiConfig, setAiConfig] = useAtom(aiConfigAtom);
  const aiHealthStatus = useAtomValue(aiConfigStatusAtom);

  const isAiConnected = aiHealthStatus === "verified";

  useEffect(() => {
    invoke<string>("get_db_path").then(setDbPath).catch(() => { });
    invoke<any>("get_ai_settings").then(setAiConfig).catch(() => { });
  }, [setDbPath, setAiConfig]);

  useEffect(() => {
    if (isAiConnected && error && error.includes("AI connection is offline")) {
      setError(null);
    }
  }, [isAiConnected, error, setError]);

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

  interface IndexingSession {
    path: string;
    is_folder: boolean;
    reindex: boolean;
    start_index: number;
    total_files: number;
    status: string;
    updated_at: string;
  }

  useEffect(() => {
    async function checkResumeSession() {
      try {
        // Do not auto-resume if already processing in the background!
        if (isProcessing) return;

        const sessions = await invoke<IndexingSession[]>("get_active_indexing_sessions");
        const active = sessions.filter((s) => s.total_files === 0 || s.start_index < s.total_files);
        if (active.length > 0) {
          active.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          const session = active[0];
          console.log("[DocsManagement] Auto-resuming indexing session on app start:", session);
          startIndexing(session.path, session.is_folder, true, session.start_index, session.reindex, true);
        }
      } catch (err) {
        console.error("Failed to check active indexing sessions on mount:", err);
      }
    }
    checkResumeSession();
  }, []);

  async function startIndexing(
    path: string,
    folder: boolean,
    isContinue: boolean = false,
    startIndex: number = 0,
    reindex: boolean = false,
    autoResume: boolean = false
  ) {
    if (isProcessing) {
      console.log("[DocsManagement] Indexing is already running in background. Ignoring duplicate call.");
      return;
    }

    globalIsCancelled = false;
    console.log("startIndexing called", { path, folder, isContinue, startIndex, reindex, autoResume, itemsLength: items.length });
    
    // Check if AI connection is verified for all flows (including startup auto-resume)
    const isAiConnectedCheck = aiHealthStatus === "verified";
    if (!isAiConnectedCheck) {
      setError("AI connection is offline. Please click the status badge in the top right (e.g. 'API Offline') to check/start the connection before indexing.");
      if (!autoResume) {
        navigate("/docs-management/scan");
      }
      setShowOutput(true);
      setSelectedPath(path);
      setIsFolder(folder);
      return;
    }

    if (!autoResume) {
      navigate("/docs-management/scan");
    }
    setSelectedPath(path);
    setIsFolder(folder);
    setShowOutput(true);
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
        console.log("[DocsManagement] Await completed, but session was cancelled. Ignoring result.");
        return;
      }
      setSummary(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
      setItems((prev) => prev.filter((item) => item.status !== "processing"));
      globalUnlisten?.();
      globalUnlisten = null;
      await invoke("allow_sleep").catch((err) => {
        console.error("Failed to allow sleep:", err);
      });
    }
  }

  const currentItem = items.find((i) => i.status === "processing");

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
      <DocsManagementHeader
        dbPath={dbPath}
        isProcessing={isProcessing}
        scanCount={
          isFolder && isProcessing
            ? {
                current: items.filter((i) => i.file_name !== "").length,
                total: currentItem?.total || items[0]?.total || 0,
              }
            : undefined
        }
        resetState={resetState}
      />

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {aiConfig ? (aiConfig.aiMode === "byom" && !aiConfig.apiKey && <CheckApiKey apiKey="" />) : (!apiKey && <CheckApiKey apiKey="" />)}

        <Routes>
          <Route path="/" element={<DocsManagementSearch />} />
          <Route path="search" element={<DocsManagementSearch />} />
          <Route
            path="scan"
            element={
              <DocsManagementScan
                show={showOutput}
                isFolder={isFolder}
                isProcessing={isProcessing}
                selectedPath={selectedPath}
                items={items}
                currentItem={currentItem}
                summary={summary}
                error={error}
                startIndexing={startIndexing}
                resetState={resetState}
                setSelectedPath={setSelectedPath}
                setIsFolder={setIsFolder}
                setShowOutput={setShowOutput}
              />
            }
          />
          <Route path="templates" element={<DocsManagementTemplates />} />
        </Routes>
      </div>
    </div>
  );
}
