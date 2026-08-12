import { auth } from "../../auth";
import { mockCases, mockStatTiles } from "../../lib/dashboard/mockData";
import OpenCasesPanel from "@/components/app/dashboard/OpenCasesPanel";
import StatTilesGrid from "@/components/app/dashboard/StatTilesGrid";

export default async function AppHomePage() {
  const session = await auth();
  const userName = session?.user?.name || session?.user?.email || "there";

  return (
    <div className="px-6 pt-2 pb-10">
      <h1 className="text-2xl font-bold text-foreground">Welcome {userName}</h1>

      <div className="mt-6 flex flex-col gap-6">
        <StatTilesGrid tiles={mockStatTiles} />
        <OpenCasesPanel cases={mockCases} />
      </div>
    </div>
  );
}
