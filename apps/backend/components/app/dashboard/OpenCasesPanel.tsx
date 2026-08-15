"use client";

import type { CaseSummary } from "../../../lib/dashboard/types";
import CaseGroup from "@/components/app/dashboard/CaseGroup";
import { useLanguage } from "../../../context/LanguageContext";

type OpenCasesPanelProps = {
  cases: CaseSummary[];
};

const MAX_RECENT_CASES = 5;

function getRecentCases(cases: CaseSummary[]): CaseSummary[] {
  return [...cases].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MAX_RECENT_CASES);
}

function getFollowUpCases(cases: CaseSummary[]): CaseSummary[] {
  const now = new Date();
  return cases.filter((c) => c.dueDate && new Date(c.dueDate) < now);
}

function getEmailArrivedCases(cases: CaseSummary[]): CaseSummary[] {
  return cases.filter((c) => c.hasPendingEmail);
}

export default function OpenCasesPanel({ cases }: OpenCasesPanelProps) {
  const { t } = useLanguage();

  return (
    <div className="rounded-2xl bg-card overflow-hidden shadow-2xl max-w-sm">
      <div className="px-5 py-4">
        <h2 className="text-lg font-bold text-foreground">{t("dashboard_open_activities")}</h2>
      </div>
      <div className="flex flex-col gap-3 pb-2">
        <CaseGroup title={t("dashboard_recent_cases")} cases={getRecentCases(cases)} />
        <CaseGroup title={t("dashboard_follow_up")} cases={getFollowUpCases(cases)} />
        <CaseGroup title={t("dashboard_email_arrived")} cases={getEmailArrivedCases(cases)} collapsedVisibleCount={2} />
      </div>
    </div>
  );
}
