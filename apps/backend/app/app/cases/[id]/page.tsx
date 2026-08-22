import { notFound, redirect } from "next/navigation";
import { auth } from "../../../../auth";
import { getVisibleCaseById, listVisibleCases } from "../../../../lib/cases/crud";
import { listTasksForCase, listCaseIdsWithOverdueTask } from "../../../../lib/tasks/crud";
import { listMeetingsForCase } from "../../../../lib/calendar/crud";
import { listDocumentsForCase } from "../../../../lib/documents/crud";
import type { Actor } from "../../../../lib/permissions";
import CasesSidebar from "@/components/app/cases/CasesSidebar";
import CasesHeader from "@/components/app/cases/CasesHeader";
import CasesListPanel from "@/components/app/cases/CasesListPanel";
import CaseDetailClient from "@/components/app/cases/CaseDetailClient";

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const actor: Actor = {
    id: session.user.id,
    role: ((session.user as { role?: string }).role as Actor["role"]) ?? "flat",
    firmId: (session.user as { firmId?: string | null }).firmId ?? null,
  };

  const { id } = await params;
  const caseRow = await getVisibleCaseById(actor, id);
  if (!caseRow) {
    notFound();
  }

  const [allCases, overdueCaseIds, tasks, meetings, documents] = await Promise.all([
    listVisibleCases(actor),
    listCaseIdsWithOverdueTask(actor),
    listTasksForCase(actor, id),
    listMeetingsForCase(actor, id),
    listDocumentsForCase(actor, id),
  ]);

  return (
    <div className="flex w-full">
      <CasesSidebar />
      <div className="flex-1 p-6">
        <CasesHeader totalCount={allCases.length} />
        <div className="flex gap-4">
          <CasesListPanel cases={allCases} overdueCaseIds={Array.from(overdueCaseIds)} selectedCaseId={id} />
          <CaseDetailClient initialCase={caseRow} isOwner={caseRow.userId === actor.id} initialTasks={tasks} initialMeetings={meetings} initialDocuments={documents} />
        </div>
      </div>
    </div>
  );
}
