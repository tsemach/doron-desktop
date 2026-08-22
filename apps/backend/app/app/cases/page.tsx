import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { listVisibleCases } from "../../../lib/cases/crud";
import { listCaseIdsWithOverdueTask } from "../../../lib/tasks/crud";
import type { Actor } from "../../../lib/permissions";
import CasesSidebar from "@/components/app/cases/CasesSidebar";
import CasesHeader from "@/components/app/cases/CasesHeader";
import CasesListPanel from "@/components/app/cases/CasesListPanel";
import NoCaseSelected from "@/components/app/cases/NoCaseSelected";

// Mirrors desktop's CaseManagement.tsx master-detail layout: sidebar +
// case list + detail panel, all visible together (not full-page
// navigation to a separate route the way this page worked before).
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

  const [cases, overdueCaseIds] = await Promise.all([listVisibleCases(actor), listCaseIdsWithOverdueTask(actor)]);

  return (
    <div className="flex w-full">
      <CasesSidebar />
      <div className="flex-1 p-6">
        <CasesHeader totalCount={cases.length} />
        <div className="flex gap-4">
          <CasesListPanel cases={cases} overdueCaseIds={Array.from(overdueCaseIds)} />
          <NoCaseSelected />
        </div>
      </div>
    </div>
  );
}
