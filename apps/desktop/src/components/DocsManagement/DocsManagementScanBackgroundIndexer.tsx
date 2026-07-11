import { useEffect, useState } from "react";
import { useIndexing, type IndexingSession } from "../../hooks/useIndexing";
import { invoke } from "@tauri-apps/api/core";
import { useAtomValue } from "jotai";
import { aiConfigStatusAtom } from "../../store/aiStore";

export default function DocsManagementScanBackgroundIndexer() {
  const { isProcessing, startIndexing } = useIndexing();
  const aiHealthStatus = useAtomValue(aiConfigStatusAtom);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    if (hasChecked) return;
    if (aiHealthStatus !== "verified") return; // Wait until AI health is verified!

    async function checkResumeSession() {
      try {
        if (isProcessing) return;

        const sessions = await invoke<IndexingSession[]>("get_active_indexing_sessions");
        const active = sessions.filter((s) => s.total_files === 0 || s.start_index < s.total_files);
        if (active.length > 0) {
          active.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          const session = active[0];
          console.log("[DocsManagementScanBackgroundIndexer] Auto-resuming indexing session on app start:", session);
          setHasChecked(true);
          startIndexing(session.path, session.is_folder, true, session.start_index, session.reindex, true);
        } else {
          setHasChecked(true);
        }
      } catch (err) {
        console.error("Failed to check active indexing sessions on mount:", err);
        setHasChecked(true);
      }
    }
    checkResumeSession();
  }, [aiHealthStatus, isProcessing, hasChecked]);

  return null;
}
