import { eq } from "drizzle-orm";
import { auth } from "../../auth";
import { db } from "../../database";
import { firms } from "../../database/schema";
import { mockCases, mockNotifications, mockStatTiles } from "../../lib/dashboard/mockData";
import RecentCasesList from "@/components/app/dashboard/RecentCasesList";
import StatTilesGrid from "@/components/app/dashboard/StatTilesGrid";
import NotificationsPanel from "@/components/app/dashboard/NotificationsPanel";

export default async function AppHomePage() {
  const session = await auth();
  const firmId = (session?.user as { firmId?: string | null } | undefined)?.firmId ?? null;

  // Self-registered ("flat") users have no firm (see packages/backend-orm's
  // schema comment on users.firmId) -- fall back to a generic label instead
  // of showing a blank/undefined firm name.
  let workspaceLabel = "Personal workspace";
  if (firmId) {
    const [firm] = await db.select({ name: firms.name }).from(firms).where(eq(firms.id, firmId)).limit(1);
    if (firm?.name) {
      workspaceLabel = firm.name;
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
      <p className="text-sm text-muted-foreground mt-1">{workspaceLabel}</p>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <RecentCasesList cases={mockCases} />
          <StatTilesGrid tiles={mockStatTiles} />
        </div>
        <div>
          <NotificationsPanel notifications={mockNotifications} />
        </div>
      </div>
    </div>
  );
}
