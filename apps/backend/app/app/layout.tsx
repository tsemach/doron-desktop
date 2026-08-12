import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { db } from "../../database";
import { firms } from "../../database/schema";
import { mockNotifications } from "../../lib/dashboard/mockData";
import AppTopBar from "@/components/app/AppTopBar";
import NotificationBell from "@/components/app/dashboard/NotificationBell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userName = session.user.name || session.user.email || null;
  const tier = (session.user as { tier?: string }).tier ?? "free";
  const firmId = (session.user as { firmId?: string | null }).firmId ?? null;

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
    <div className="min-h-screen flex flex-col bg-white text-slate-900 font-sans">
      <AppTopBar userName={userName} tier={tier} workspaceLabel={workspaceLabel} />
      <main className="flex-grow w-full">{children}</main>
      <NotificationBell notifications={mockNotifications} />
    </div>
  );
}
