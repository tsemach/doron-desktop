import type { CaseStatus } from "@/components/CaseManagement/CaseManagementTypes";

const RECENT_CASES_KEY = "recent_cases";
const MAX_RECENT_CASES = 3;

export interface RecentCase {
  id: string;
  subject?: string;
  name: string;
  status: CaseStatus;
  date?: string;
}

export function getRecentCases(): RecentCase[] {
  try {
    const raw = localStorage.getItem(RECENT_CASES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is RecentCase => {
        if (!entry || typeof entry !== "object") return false;
        const candidate = entry as Partial<RecentCase>;
        return (
          typeof candidate.id === "string" &&
          typeof candidate.name === "string" &&
          typeof candidate.status === "string"
        );
      })
      .slice(0, MAX_RECENT_CASES);
  } catch {
    return [];
  }
}

// Called on every case visit, so the stored subject/name/status also stays in
// sync with renames or status changes without the home screen hitting the backend.
export function rememberRecentCase(visited: RecentCase): RecentCase[] {
  const entry: RecentCase = {
    id: visited.id,
    subject: visited.subject,
    name: visited.name,
    status: visited.status,
    date: visited.date,
  };
  const next = [entry, ...getRecentCases().filter((c) => c.id !== entry.id)].slice(
    0,
    MAX_RECENT_CASES,
  );
  writeRecentCases(next);
  return next;
}

export function forgetRecentCase(id: string): RecentCase[] {
  const next = getRecentCases().filter((c) => c.id !== id);
  writeRecentCases(next);
  return next;
}

function writeRecentCases(cases: RecentCase[]) {
  try {
    localStorage.setItem(RECENT_CASES_KEY, JSON.stringify(cases));
  } catch {
    // Storage is best-effort — a full/blocked quota must never break navigation.
  }
}
