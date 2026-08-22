import { notFound, redirect } from "next/navigation";
import { auth } from "../../../../auth";
import { getVisibleCaseById } from "../../../../lib/cases/crud";
import type { Actor } from "../../../../lib/permissions";
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

  return <CaseDetailClient initialCase={caseRow} isOwner={caseRow.userId === actor.id} />;
}
