import type { CaseSummary } from "../../../lib/dashboard/types";
import CaseGroup from "@/components/app/dashboard/CaseGroup";

type OpenCasesPanelProps = {
  cases: CaseSummary[];
};

const MAX_RECENT_CASES = 5;

function getRecentCases(cases: CaseSummary[]): CaseSummary[] {
  return [...cases].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_RECENT_CASES);
}

function getFollowUpCases(cases: CaseSummary[]): CaseSummary[] {
  const now = new Date();
  return cases.filter((c) => c.dueDate && new Date(c.dueDate) < now);
}

function getEmailArrivedCases(cases: CaseSummary[]): CaseSummary[] {
  return cases.filter((c) => c.hasPendingEmail);
}

export default function OpenCasesPanel({ cases }: OpenCasesPanelProps) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Open cases</h2>
      </div>
      <div className="divide-y divide-border">
        <CaseGroup title="Recent cases" cases={getRecentCases(cases)} />
        <CaseGroup title="Follow up" cases={getFollowUpCases(cases)} />
        <CaseGroup title="Email arrived" cases={getEmailArrivedCases(cases)} />
      </div>
    </div>
  );
}
