import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Case, CaseStatus } from "../CaseManagementTypes";
import { useLanguage } from "../../../context/LanguageContext";

const STATUS_STYLES: Record<CaseStatus, string> = {
  open: "bg-zinc-100 text-zinc-700 dark:bg-zinc-900/30 dark:text-zinc-300",
  "in-progress": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  closed: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  followup: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

interface OpenCasesListItemProps {
  c: Case;
  isSelected: boolean;
  onSelectCase: (c: Case) => void;
  onCloseCase: (id: string) => void;
  onDeleteCase: (c: Case) => void;
  onOpenFolder: (folderPath: string) => void;
}

export default function OpenCasesListItem({
  c,
  isSelected,
  onSelectCase,
  onCloseCase,
  onDeleteCase,
  onOpenFolder,
}: OpenCasesListItemProps) {
  const { t } = useLanguage();

  const getFollowupStatus = (dateStr?: string) => {
    if (!dateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    
    if (target.getTime() < today.getTime()) {
      return { type: "overdue", label: `Overdue: ${dateStr}` };
    } else if (target.getTime() === today.getTime()) {
      return { type: "due-today", label: `Due Today: ${dateStr}` };
    } else {
      return { type: "pending", label: `Follow-up: ${dateStr}` };
    }
  };

  const followupStatus = getFollowupStatus(c.followupDate);

  return (
    <tr
      onClick={() => onSelectCase(c)}
      className={`border-t border-border cursor-pointer transition-all hover:bg-muted/70 ${
        isSelected
          ? "bg-primary/5 dark:bg-primary/10 border-l-4 border-l-primary font-medium"
          : ""
      }`}
    >
      <td className="px-4 py-3.5">
        <Link
          to={`/case-management/cases/${c.id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-semibold text-primary hover:underline leading-snug block w-fit"
        >
          {c.subject || t("no_subject")}
        </Link>
        <div className="text-xs text-muted-foreground mt-0.5 font-normal">{c.name}</div>
        
        {followupStatus && (
          <div className="mt-1.5 select-none">
            {followupStatus.type === "overdue" ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 text-[10px] font-bold border border-rose-200/50 animate-pulse">
                <span>⚠️</span> {followupStatus.label}
              </span>
            ) : followupStatus.type === "due-today" ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[10px] font-bold border border-amber-200/50">
                <span>⏰</span> {followupStatus.label}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300 text-[10px] font-semibold border border-blue-100/30">
                <span>📅</span> {followupStatus.label}
              </span>
            )}
          </div>
        )}

        {c.folder && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span
              className="text-[10px] text-muted-foreground/75 font-mono truncate max-w-[220px]"
              title={c.folder}
            >
              {c.folder}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenFolder(c.folder!);
              }}
              className="text-muted-foreground hover:text-foreground shrink-0 p-0.5 rounded hover:bg-muted/80 transition-colors"
              title="Open folder in File Explorer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
              </svg>
            </button>
          </div>
        )}
      </td>
      <td className="px-4 py-3.5 align-middle">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[c.status]}`}>
          {c.status === "open" ? t("status_open") : c.status === "in-progress" ? t("status_in_progress") : c.status === "followup" ? t("status_followup") : t("status_closed")}
        </span>
      </td>
      <td className="px-4 py-3.5 align-middle text-xs text-muted-foreground whitespace-nowrap">
        {c.createdAt}
      </td>
      <td className="px-4 py-3.5 text-right align-middle" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1 justify-end items-center">
          {c.status !== "closed" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onCloseCase(c.id)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title={t("close_case_title")}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDeleteCase(c)}
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            title={t("delete_case_title")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              <line x1="10" x2="10" y1="11" y2="17" />
              <line x1="14" x2="14" y1="11" y2="17" />
            </svg>
          </Button>
        </div>
      </td>
    </tr>
  );
}
