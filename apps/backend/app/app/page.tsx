import { Briefcase, CalendarDays, FileText } from "lucide-react";
import { auth } from "../../auth";
import { listVisibleCases } from "../../lib/cases/crud";
import { listOpenTasksGroupedByCase, listFollowUpTasks } from "../../lib/tasks/crud";
import { listTodaysMeetings } from "../../lib/calendar/crud";
import { listPendingEmailAlerts } from "../../lib/email/crud";
import type { Actor } from "../../lib/permissions";
import { translations, type Language } from "../../locales/translations";
import HomeNavTile from "@/components/app/home/HomeNavTile";
import RecentCasesPanel from "@/components/app/home/RecentCasesPanel";
import DocumentsPanel from "@/components/app/home/DocumentsPanel";
import TodaysMeetingsPanel from "@/components/app/home/TodaysMeetingsPanel";
import OverviewPanel from "@/components/app/home/OverviewPanel";

// Mirrors desktop's AppHome.tsx structure: welcome banner, 3 rows of
// [nav tile + panel] (Cases/Recent Cases, Documents/search, Calendar/
// Today's Meetings), Overview column on the right. Desktop's Home has no
// stat-tiles row and no Emails/Billing cards -- those aren't part of its
// actual design, confirmed by reading the real component, not assumed
// from an earlier backend-only mockup.
export default async function AppHomePage() {
  const session = await auth();
  const userName = session?.user?.name || session?.user?.email || "there";
  const locale: Language = (session?.user as { locale?: string } | undefined)?.locale === "he" ? "he" : "en";
  const t = translations[locale];

  const actor: Actor | null = session?.user?.id
    ? {
        id: session.user.id,
        role: ((session.user as { role?: string }).role as Actor["role"]) ?? "flat",
        firmId: (session.user as { firmId?: string | null }).firmId ?? null,
      }
    : null;

  const [cases, openTaskGroups, followUps, todaysMeetings, pendingEmailAlerts] = actor
    ? await Promise.all([
        listVisibleCases(actor),
        listOpenTasksGroupedByCase(actor),
        listFollowUpTasks(actor),
        listTodaysMeetings(actor),
        listPendingEmailAlerts(actor),
      ])
    : [[], [], [], [], []];

  return (
    <div className="min-h-screen flex flex-col px-10 py-10">
      <h1 className="text-2xl font-bold text-foreground text-center">
        {t.dashboard_welcome} {userName}
      </h1>

      <div className="flex-1 flex items-start justify-center mt-20">
        <div className="max-w-7xl flex gap-12">
          <div className="flex flex-col gap-10">
            <div className="flex items-start gap-8">
              <HomeNavTile href="/app/cases" icon={Briefcase} label="Cases" />
              <RecentCasesPanel cases={cases} />
            </div>
            <div className="flex items-start gap-8">
              <HomeNavTile href="/app/documents" icon={FileText} label="Documents" />
              <DocumentsPanel />
            </div>
            <div className="flex items-start gap-8">
              <HomeNavTile href="/app/calendar" icon={CalendarDays} label="Calendar" />
              <TodaysMeetingsPanel meetings={todaysMeetings} />
            </div>
          </div>

          <OverviewPanel openTaskGroups={openTaskGroups} followUps={followUps} pendingEmailAlerts={pendingEmailAlerts} />
        </div>
      </div>
    </div>
  );
}
