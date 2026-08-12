import { Briefcase } from "lucide-react";
import type { CaseSummary } from "../../../lib/dashboard/types";
import { formatDashboardDate } from "../../../lib/dashboard/formatDate";
import CaseStatusBadge from "@/components/app/dashboard/CaseStatusBadge";

type CaseRowProps = {
  caseItem: CaseSummary;
};

export default function CaseRow({ caseItem }: CaseRowProps) {
  return (
    <li className="flex items-center justify-between gap-4 pl-8 pr-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Briefcase className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{caseItem.subject}</p>
          <p className="truncate text-xs text-muted-foreground">{caseItem.client}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <CaseStatusBadge status={caseItem.status} />
        <span className="text-xs text-muted-foreground">{formatDashboardDate(caseItem.updatedAt)}</span>
      </div>
    </li>
  );
}
