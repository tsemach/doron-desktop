import type { IndexingSession } from "@/components/DocsManagement/scan/types";

export function pickLatestActiveIndexingSession(
  sessions: IndexingSession[],
): IndexingSession | null {
  const active = sessions.filter(
    (session) => session.total_files === 0 || session.start_index < session.total_files,
  );
  if (active.length === 0) return null;

  active.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  return active[0];
}
