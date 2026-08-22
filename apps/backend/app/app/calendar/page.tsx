import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { listUpcomingMeetings } from "../../../lib/calendar/crud";
import { listVisibleCases } from "../../../lib/cases/crud";
import type { Actor } from "../../../lib/permissions";
import CalendarClient from "@/components/app/calendar/CalendarClient";

// Local meetings only in this pass -- Google Calendar OAuth connection and
// two-way sync are a deferred follow-up needing real Google Cloud
// credentials to build and verify against (see lib/calendar/crud.ts).
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
  return <CalendarClient initialMeetings={meetings} cases={cases.map((c) => ({ id: c.id, name: c.name }))} />;
}
