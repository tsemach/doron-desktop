"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreVertical } from "lucide-react";
import { Button } from "@workspace/ui";
import CaseStatusBadge from "../CaseStatusBadge";
import type { CaseRow } from "../../../lib/cases/crud";

type Filter = "open" | "all" | "waiting" | "followup" | "closed";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "all", label: "All" },
  { key: "waiting", label: "Waiting" },
  { key: "followup", label: "Follow Up" },
  { key: "closed", label: "Closed" },
];

type CasesListPanelProps = {
  cases: CaseRow[];
  overdueCaseIds: string[];
  selectedCaseId?: string;
};

// Matches desktop's OpenCasesTopBar.tsx (filter tabs) + OpenCasesListItem.tsx
// (table rows) structure/classes.
export default function CasesListPanel({ cases, overdueCaseIds, selectedCaseId }: CasesListPanelProps) {
  const [filter, setFilter] = useState<Filter>("open");
  const overdueSet = new Set(overdueCaseIds);

  const counts = {
    waiting: cases.filter((c) => c.status === "waiting").length,
    followup: overdueSet.size,
  };

  const filtered = cases.filter((c) => {
    if (filter === "all") return true;
    if (filter === "followup") return overdueSet.has(c.id);
    return c.status === filter;
  });

  return (
    <div className="flex flex-col border border-border rounded-xl bg-card overflow-hidden shadow-xs w-[420px] shrink-0">
      <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-border flex-wrap">
        {FILTERS.map(({ key, label }) => (
          <Button key={key} size="sm" variant={filter === key ? "default" : "outline"} onClick={() => setFilter(key)}>
            {label}
            {key === "waiting" && counts.waiting > 0 && (
              <span className="ml-1 rounded-full bg-background/20 px-1.5 text-[10px]">{counts.waiting}</span>
            )}
            {key === "followup" && counts.followup > 0 && (
              <span className="ml-1 rounded-full bg-background/20 px-1.5 text-[10px]">{counts.followup}</span>
            )}
          </Button>
        ))}
      </div>

      <div className="overflow-y-auto max-h-[70vh]">
        {filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No cases in this view.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b border-border/60 last:border-0 ${c.id === selectedCaseId ? "bg-primary/5 border-l-4 border-l-primary" : ""}`}
                >
                  <td className="px-3 py-2.5">
                    <Link href={`/app/cases/${c.id}`} className="font-semibold text-primary hover:underline">
                      {c.name}
                    </Link>
                    {c.subject && <p className="text-xs text-muted-foreground">{c.subject}</p>}
                    {overdueSet.has(c.id) && (
                      <span className="mt-0.5 inline-block rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600">
                        Overdue
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <CaseStatusBadge status={c.status} />
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-2">
                    <MoreVertical className="size-4 text-muted-foreground" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
