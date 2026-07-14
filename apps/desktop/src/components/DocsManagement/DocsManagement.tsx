import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import CheckApiKey from "../ui/check-api-key";
import DocsManagementHeader from "./DocsManagementHeader";
import DocsManagementScan from "./DocsManagementScan";
import DocsManagementTemplates from "./DocsManagementTemplates/DocsManagementTemplates";
import DocsManagementSearch from "./DocsManagementSearch";
import { useAtom } from "jotai";
import { aiConfigAtom } from "../../store/aiStore";
import { dbPathAtom } from "../../store/indexStore";
import { useIndexing } from "../../hooks/useIndexing";

export default function DocsManagement() {
  const [dbPath, setDbPath] = useAtom(dbPathAtom);
  const [aiConfig, setAiConfig] = useAtom(aiConfigAtom);
  const {
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
  } = useIndexing();

  const apiKey = localStorage.getItem("gemini_api_key") ?? "";

  useEffect(() => {
    invoke<string>("get_db_path").then(setDbPath).catch(() => { });
    invoke<any>("get_ai_settings").then(setAiConfig).catch(() => { });
  }, [setDbPath, setAiConfig]);

  const currentItem = items.find((i) => i.status === "processing");

  return (
    <div className="flex flex-col h-screen w-full bg-background overflow-hidden">
      <DocsManagementHeader
        dbPath={dbPath}
        isProcessing={isProcessing}
        scanCount={
          isFolder && showOutput
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
