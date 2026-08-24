import { auth } from "../../auth";
import { mockBillingSummary, mockCases, mockEmailArrivals, mockStatTiles } from "../../lib/dashboard/mockData";
import { listImportantTasks } from "../../lib/tasks/crud";
import type { Actor } from "../../lib/permissions";
import OpenCasesPanel from "@/components/app/dashboard/OpenCasesPanel";
import StatTilesGrid from "@/components/app/dashboard/StatTilesGrid";
import ImportantTasksCard from "@/components/app/dashboard/ImportantTasksCard";
import EmailsArrivedCard from "@/components/app/dashboard/EmailsArrivedCard";
import BillingFinanceCard from "@/components/app/dashboard/BillingFinanceCard";
import { translations, type Language } from "../../locales/translations";

export default async function AppHomePage() {
  const session = await auth();
  const userName = session?.user?.name || session?.user?.email || "there";
  // Server Component -- see app/app/layout.tsx's comment on why this reads
  // the dictionary directly instead of useLanguage().
  const locale: Language = (session?.user as { locale?: string } | undefined)?.locale === "he" ? "he" : "en";
  const t = translations[locale];

  // ImportantTasksCard is real now (queries the tasks table); the other
  // three cards (OpenCasesPanel/EmailsArrivedCard/BillingFinanceCard)
  // stay on mock data until their own backends exist (documents/email
  // ingestion/billing are later phases).
  const importantTasks = session?.user?.id
    ? await listImportantTasks({
        id: session.user.id,
        role: ((session.user as { role?: string }).role as Actor["role"]) ?? "flat",
        firmId: (session.user as { firmId?: string | null }).firmId ?? null,
      })
    : [];

  return (
    <div className="px-6 pt-2 pb-10">
      <h1 className="text-2xl font-bold text-foreground">
        {t.dashboard_welcome} {userName}
      </h1>

      <div className="mt-6 flex flex-col">
        <StatTilesGrid tiles={mockStatTiles} />
        <div className="mt-10 grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,24rem)_repeat(3,minmax(0,300px))]">
          <OpenCasesPanel cases={mockCases} />
          <ImportantTasksCard tasks={importantTasks} />
          <EmailsArrivedCard emails={mockEmailArrivals} />
          <BillingFinanceCard billing={mockBillingSummary} />
        </div>
      </div>
    </div>
  );
}
