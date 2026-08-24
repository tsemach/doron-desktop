import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { listUpcomingMeetings } from "../../../lib/calendar/crud";
import { listVisibleCases } from "../../../lib/cases/crud";
import type { Actor } from "../../../lib/permissions";
import CalendarHeader from "@/components/app/calendar/CalendarHeader";
import CalendarView from "@/components/app/calendar/CalendarView";

// Mirrors desktop's Calendar.tsx: header + toolbar + week/day/month grid
// with positioned meeting blocks. Local meetings only in this pass --
// see lib/calendar/crud.ts for the Google OAuth scope cut.
export default async function CalendarPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const actor: Actor = {
    id: session.user.id,
    role: ((session.user as { role?: string }).role as Actor["role"]) ?? "flat",
    firmId: (session.user as { firmId?: string | null }).firmId ?? null,
  };

  const [meetings, cases] = await Promise.all([listUpcomingMeetings(actor), listVisibleCases(actor)]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <CalendarHeader />
      <div className="flex-1 min-h-0">
        <CalendarView initialMeetings={meetings} cases={cases.map((c) => ({ id: c.id, name: c.name }))} />
      </div>
    </div>
  );
}
