import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { listVisibleCases } from "../../../lib/cases/crud";
import type { Actor } from "../../../lib/permissions";
import CasesListClient from "@/components/app/cases/CasesListClient";

export default async function CasesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const actor: Actor = {
    id: session.user.id,
    role: ((session.user as { role?: string }).role as Actor["role"]) ?? "flat",
    firmId: (session.user as { firmId?: string | null }).firmId ?? null,
  };

  const cases = await listVisibleCases(actor);
  return <CasesListClient initialCases={cases} />;
}
