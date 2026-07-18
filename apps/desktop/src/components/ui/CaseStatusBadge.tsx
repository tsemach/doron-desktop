import { useLanguage } from "@/context/LanguageContext";
import type { CaseStatus } from "@/components/CaseManagement/CaseManagementTypes";

const STATUS_STYLES: Record<CaseStatus, string> = {
  open: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-300",
  waiting: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  closed: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  followup: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

interface CaseStatusBadgeProps {
  status: CaseStatus;
  className?: string;
}

export default function CaseStatusBadge({ status, className = "" }: CaseStatusBadgeProps) {
  const { t } = useLanguage();
  const label =
    status === "open" ? t("status_open") :
    status === "waiting" ? t("status_waiting") :
    status === "followup" ? t("status_followup") :
    t("status_closed");

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]} ${className}`}>
      {label}
    </span>
  );
}
