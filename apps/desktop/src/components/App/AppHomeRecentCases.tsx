import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Briefcase, Plus } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import { getRecentCases } from "../../lib/case";
import CaseStatusBadge from "../ui/CaseStatusBadge";

export default function AppHomeRecentCases() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  // Read once per mount -- AppHome is remounted on every return to "/", so the
  // list is always fresh without needing a subscription.
  const [recentCases] = useState(getRecentCases);

  return (
    <div className="w-96 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-foreground">{t("recent_cases")}</span>
        <button
          type="button"
          onClick={() => navigate("/case-management/new-case")}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
        >
          <Plus className="size-3.5" />
          {t("new_case")}
        </button>
      </div>

      {recentCases.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground/70">
          {t("no_recent_cases")}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {recentCases.map((c) => (
              <li key={c.id}>
                <Link
                  to={`/case-management/cases/${c.id}`}
                  className="group flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 transition-colors"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Briefcase className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                      {c.subject || t("no_subject")}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{c.name}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <CaseStatusBadge status={c.status} />
                    {c.date && (
                      <span className="text-[10px] text-muted-foreground/70">{c.date}</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="px-4 py-2.5 border-t border-border text-right">
            <Link
              to="/case-management"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
            >
              {t("view_all_cases")} &rarr;
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
