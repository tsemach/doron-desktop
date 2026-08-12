import type { CaseStatus } from "../../../lib/dashboard/types";

// Colors ported from apps/desktop/src/components/ui/CaseStatusBadge.tsx
// (minus the "followup" variant and dark: classes -- see plan's Global
// Constraints for why).
const STATUS_STYLES: Record<CaseStatus, string> = {
  open: "bg-zinc-100 text-zinc-700",
  waiting: "bg-yellow-100 text-yellow-700",
  closed: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<CaseStatus, string> = {
  open: "Open",
  waiting: "Waiting",
  closed: "Closed",
};

type CaseStatusBadgeProps = {
  status: CaseStatus;
};

export default function CaseStatusBadge({ status }: CaseStatusBadgeProps) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
