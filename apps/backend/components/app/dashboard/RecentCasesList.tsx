import { Briefcase } from "lucide-react";
import type { CaseSummary } from "../../../lib/dashboard/types";
import { formatDashboardDate } from "../../../lib/dashboard/formatDate";
import CaseStatusBadge from "@/components/app/dashboard/CaseStatusBadge";

type RecentCasesListProps = {
  cases: CaseSummary[];
};

const MAX_VISIBLE_CASES = 5;

export default function RecentCasesList({ cases }: RecentCasesListProps) {
  const recent = [...cases]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_VISIBLE_CASES);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Recent Cases</h2>
      </div>
      {recent.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">No recent cases</p>
      ) : (
        <ul className="divide-y divide-border">
          {recent.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Briefcase className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{c.subject}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.client}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <CaseStatusBadge status={c.status} />
                <span className="text-xs text-muted-foreground">{formatDashboardDate(c.updatedAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
