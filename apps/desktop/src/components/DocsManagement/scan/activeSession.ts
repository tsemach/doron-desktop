import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import type { IndexingSession } from "./types";
import { pickLatestActiveIndexingSession } from "@/lib/indexing";

export function isActiveIndexingSession(session: IndexingSession): boolean {
  return session.total_files === 0 || session.start_index < session.total_files;
}

export async function fetchLatestActiveIndexingSession(): Promise<IndexingSession | null> {
  const sessions = await invoke<IndexingSession[]>("get_active_indexing_sessions");
  return pickLatestActiveIndexingSession(sessions);
}

export function useActiveIndexingSession(refreshKey?: unknown) {
  const [activeSession, setActiveSession] = useState<IndexingSession | null>(null);

  useEffect(() => {
    fetchLatestActiveIndexingSession()
      .then(setActiveSession)
      .catch((err) => console.error("Failed to check active indexing sessions:", err));
  }, [refreshKey]);

  return { activeSession, setActiveSession };
}
