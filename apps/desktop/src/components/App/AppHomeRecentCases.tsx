import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Briefcase, Plus, Mail } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useLanguage } from "../../context/LanguageContext";
import { getRecentCases } from "../../lib/case";
import CaseStatusBadge from "../ui/CaseStatusBadge";

export default function AppHomeRecentCases() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  // Read once per mount -- AppHome is remounted on every return to "/", so the
  // list is always fresh without needing a subscription.
  const [recentCases] = useState(getRecentCases);
  const [emailAlertCount, setEmailAlertCount] = useState(0);

  useEffect(() => {
    async function loadAlertCount() {
      try {
        const alerts = await invoke<any[]>("list_pending_email_alerts");
        setEmailAlertCount(alerts?.length || 0);
      } catch (e) {
        console.error("Failed to load email alerts count:", e);
      }
    }

    loadAlertCount();

    const unlistenPromise = listen("new-email-alert", () => {
      loadAlertCount();
    });

    const handleUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<number>;
      if (typeof customEvent.detail === "number") {
        setEmailAlertCount(customEvent.detail);
      } else {
        loadAlertCount();
      }
    };

    window.addEventListener("email-alerts-updated", handleUpdated);

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
      window.removeEventListener("email-alerts-updated", handleUpdated);
    };
  }, []);

  return (
    <div className="w-96 rounded-xl bg-card overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 pt-0.5 pb-3">
        <span className="text-sm font-semibold text-foreground">{t("recent_cases")}</span>
      </div>

      {recentCases.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-muted-foreground/70">
          {t("no_recent_cases")}
        </div>
      ) : (
        <>
          <ul className="pl-4">
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

          <div className="px-4 py-2.5 flex items-center justify-between text-right">
            <button
              type="button"
              onClick={() => navigate("/case-management/new-case")}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
            >
              <Plus className="size-3.5" />
              {t("new_case")}
            </button>
            <Link
              to="/case-management"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
            >
              {t("view_all_cases")} &rarr;
            </Link>
          </div>
        </>
      )}

      {/* Email Alert Tag Indicator */}
      {emailAlertCount > 0 && (
        <div className="px-4 pb-3 pt-1 border-t border-border/50 mt-1 flex items-center justify-start">
          <button
            type="button"
            onClick={() => {
              navigate("/case-management");
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent("open-email-alert-review"));
              }, 100);
            }}
            className="bg-muted/80 hover:bg-muted text-foreground border border-border/80 rounded-full py-1.5 px-3 shadow-xs flex items-center gap-2 cursor-pointer transition-all hover:scale-102 active:scale-98 animate-pulse duration-1000"
            title={t("incoming_emails") || "Incoming Emails"}
          >
            <Mail className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="size-5 rounded-full bg-primary/15 text-primary font-bold text-[11px] flex items-center justify-center shrink-0">
              {emailAlertCount}
            </span>
            <span className="text-xs font-semibold truncate leading-none text-foreground">
              {t("incoming_emails") || "Incoming Emails"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
