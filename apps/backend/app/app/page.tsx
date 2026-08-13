import { auth } from "../../auth";
import {
  mockBillingSummary,
  mockCases,
  mockEmailArrivals,
  mockImportantTasks,
  mockStatTiles,
} from "../../lib/dashboard/mockData";
import OpenCasesPanel from "@/components/app/dashboard/OpenCasesPanel";
import StatTilesGrid from "@/components/app/dashboard/StatTilesGrid";
import ImportantTasksCard from "@/components/app/dashboard/ImportantTasksCard";
import EmailsArrivedCard from "@/components/app/dashboard/EmailsArrivedCard";
import BillingFinanceCard from "@/components/app/dashboard/BillingFinanceCard";

export default async function AppHomePage() {
  const session = await auth();
  const userName = session?.user?.name || session?.user?.email || "there";

  return (
    <div className="px-6 pt-2 pb-10">
      <h1 className="text-2xl font-bold text-foreground">Welcome {userName}</h1>

      <div className="mt-6 flex flex-col">
        <StatTilesGrid tiles={mockStatTiles} />
        <div className="mt-10 flex flex-col lg:flex-row gap-6 items-start">
          <OpenCasesPanel cases={mockCases} />
          <div className="flex-1 grid grid-cols-1 md:grid-cols-[repeat(3,minmax(0,300px))] gap-12 ml-5">
            <ImportantTasksCard tasks={mockImportantTasks} />
            <EmailsArrivedCard emails={mockEmailArrivals} />
            <BillingFinanceCard billing={mockBillingSummary} />
          </div>
        </div>
      </div>
    </div>
  );
}
