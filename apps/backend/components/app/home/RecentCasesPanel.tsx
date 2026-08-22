import Link from "next/link";
import { Briefcase } from "lucide-react";
import CaseStatusBadge from "../CaseStatusBadge";
import type { CaseRow } from "../../../lib/cases/crud";

// Matches desktop's AppHomeRecentCases.tsx structure/classes.
export default function RecentCasesPanel({ cases }: { cases: CaseRow[] }) {
  const recent = cases.slice(0, 5);

  return (
    <div className="w-96 rounded-xl bg-card">
      <div className="px-4 py-2.5">
        <h3 className="text-sm font-semibold">Recent Cases</h3>
      </div>
      <div className="flex flex-col">
        {recent.map((c) => (
          <Link key={c.id} href={`/app/cases/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Briefcase className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
              {c.subject && <p className="truncate text-xs text-muted-foreground">{c.subject}</p>}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <CaseStatusBadge status={c.status} />
              <span className="text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</span>
            </div>
          </Link>
        ))}
        {recent.length === 0 && <p className="px-4 py-2.5 text-sm text-muted-foreground">No cases yet.</p>}
      </div>
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/60">
        <Link href="/app/cases" className="text-xs text-primary hover:underline">
          + New Case
        </Link>
        <Link href="/app/cases" className="text-xs text-muted-foreground hover:text-foreground">
          View all →
        </Link>
      </div>
    </div>
  );
}
