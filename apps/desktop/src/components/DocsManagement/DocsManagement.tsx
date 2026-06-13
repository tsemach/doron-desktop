import { useState, useRef, useEffect } from "react";
import { useNavigate, Routes, Route } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { API_KEY_STORAGE_KEY } from "../Settings/Settings";
import CheckApiKey from "../ui/check-api-key";
import DocsManagementHeader from "./DocsManagementHeader";
import DocsManagementScan, { type ProgressItem, type ProgressStatus, type IndexSummary } from "./DocsManagementScan";
import DocsManagementTemplates from "./DocsManagementTemplates/DocsManagementTemplates";
import DocsManagementSearch from "./DocsManagementSearch";

type IndexProgressEvent = {
  file_name: string;
  status: string;
  message: string;
  current: number;
  total: number;
};

export default function DocsManagement() {
  const navigate = useNavigate();
  const [showOutput, setShowOutput] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPath, setSelectedPath] = useState("");
  const [isFolder, setIsFolder] = useState(false);
  const [items, setItems] = useState<ProgressItem[]>([]);
  const [summary, setSummary] = useState<IndexSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY) ?? "";
  const [dbPath, setDbPath] = useState("");

  useEffect(() => {
    invoke<string>("get_db_path").then(setDbPath).catch(() => { });
  }, []);

  useEffect(() => {
    return () => {
      unlistenRef.current?.();
    };
  }, []);

  async function startIndexing(path: string, folder: boolean) {
    navigate("/docs-management/scan");
    setSelectedPath(path);
    setIsFolder(folder);
    setShowOutput(true);
    setItems([]);
    setSummary(null);
    setError(null);
    setIsProcessing(true);

    unlistenRef.current = await listen<IndexProgressEvent>("indexing-progress", (event) => {
      const { file_name, status, message, current, total } = event.payload;
      setItems((prev) => {
        const idx = prev.findIndex((p) => p.file_name === file_name);
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
      const result = folder
        ? await invoke<IndexSummary>("index_folder", { folderPath: path, apiKey })
        : await invoke<IndexSummary>("index_file", { filePath: path, apiKey });
      setSummary(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsProcessing(false);
      unlistenRef.current?.();
      unlistenRef.current = null;
    }
  }

  const currentItem = items.find((i) => i.status === "processing");

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
      <DocsManagementHeader
        apiKey={apiKey}
        dbPath={dbPath}
        isProcessing={isProcessing}
        scanCount={
          isFolder && isProcessing && currentItem
            ? { current: currentItem.current, total: currentItem.total }
            : undefined
        }
      />

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <CheckApiKey apiKey={apiKey} />

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
              />
            }
          />
          <Route path="templates" element={<DocsManagementTemplates />} />
        </Routes>
      </div>
    </div>
  );
}
