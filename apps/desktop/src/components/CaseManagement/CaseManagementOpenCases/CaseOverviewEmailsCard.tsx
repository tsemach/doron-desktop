import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLanguage } from "@/context/LanguageContext";
import { formatShortDate } from "@/lib/formatShortDate";

// Minimal subset of the full CaseEmail shape (declared privately in
// OpenCasesEmailsChat.tsx) -- this card only needs these four fields.
interface CaseEmailSummary {
  id: number;
  sender: string;
  subject: string;
  received_at: string;
}

interface CaseOverviewEmailsCardProps {
  caseId: number;
  onViewAll: () => void;
}

const MAX_EMAILS_SHOWN = 5;

export default function CaseOverviewEmailsCard({ caseId, onViewAll }: CaseOverviewEmailsCardProps) {
  const { t } = useLanguage();
  const [emails, setEmails] = useState<CaseEmailSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    invoke<CaseEmailSummary[]>("list_case_emails", { caseId })
      .then((res) => {
        if (!active) return;
        const sorted = [...res].sort(
          (a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
        );
        setEmails(sorted.slice(0, MAX_EMAILS_SHOWN));
      })
      .catch((err) => {
        if (active) setError(String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [caseId]);

  return (
    <div
      onClick={onViewAll}
      className="rounded-md border border-border bg-muted/20 p-3 cursor-pointer hover:bg-muted/40 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">{t("emails")}</h4>
        {emails.length > 0 && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-[10px] font-medium text-primary hover:underline cursor-pointer"
          >
            {t("view_all_cases")} →
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">{t("loading")}</p>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : emails.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{t("no_emails")}</p>
      ) : (
        <div className="space-y-1.5">
          {emails.map((email) => (
            <div key={email.id} className="text-xs py-1 border-b border-border/50 last:border-b-0">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium text-foreground" title={email.subject} dir="auto">
                  {email.subject}
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {formatShortDate(email.received_at)}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground truncate" title={email.sender} dir="auto">
                {email.sender}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
