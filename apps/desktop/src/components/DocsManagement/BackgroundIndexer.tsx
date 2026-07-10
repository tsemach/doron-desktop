import { useEffect } from "react";
import { useIndexing, type IndexingSession } from "../../hooks/useIndexing";
import { invoke } from "@tauri-apps/api/core";

export default function BackgroundIndexer() {
  const { isProcessing, startIndexing } = useIndexing();

  useEffect(() => {
    async function checkResumeSession() {
      try {
        if (isProcessing) return;

        const sessions = await invoke<IndexingSession[]>("get_active_indexing_sessions");
        const active = sessions.filter((s) => s.total_files === 0 || s.start_index < s.total_files);
        if (active.length > 0) {
          active.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
          const session = active[0];
          console.log("[BackgroundIndexer] Auto-resuming indexing session on app start:", session);
          startIndexing(session.path, session.is_folder, true, session.start_index, session.reindex, true);
        }
      } catch (err) {
        console.error("Failed to check active indexing sessions on mount:", err);
      }
    }
    checkResumeSession();
  }, []);

  return null;
}
