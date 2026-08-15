"use client";

import type { CaseStatus } from "../../../lib/dashboard/types";
import { useLanguage } from "../../../context/LanguageContext";
import type { TranslationKey } from "../../../locales/translations";

// Colors ported from apps/desktop/src/components/ui/CaseStatusBadge.tsx
// (minus the "followup" variant and dark: classes -- see plan's Global
// Constraints for why). "open" was changed from desktop's zinc to green,
// since zinc read as visually indistinguishable from "closed" on this
// dashboard's layout -- it's no longer a literal port for that entry.
const STATUS_STYLES: Record<CaseStatus, string> = {
  open: "bg-green-100 text-green-700",
  waiting: "bg-yellow-100 text-yellow-700",
  closed: "bg-gray-100 text-gray-500",
};

const STATUS_LABEL_KEYS: Record<CaseStatus, TranslationKey> = {
  open: "case_status_open",
  waiting: "case_status_waiting",
  closed: "case_status_closed",
};

type CaseStatusBadgeProps = {
  status: CaseStatus;
};

export default function CaseStatusBadge({ status }: CaseStatusBadgeProps) {
  const { t } = useLanguage();

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
      {t(STATUS_LABEL_KEYS[status])}
    </span>
  );
}
