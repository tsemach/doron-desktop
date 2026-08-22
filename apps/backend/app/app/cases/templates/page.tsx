import { redirect } from "next/navigation";
import { auth } from "../../../../auth";
import { canManageTemplates, listVisibleCaseTemplates } from "../../../../lib/templates/crud";
import type { Actor } from "../../../../lib/permissions";
import TemplatesListClient from "@/components/app/cases/TemplatesListClient";

// Nested under /app/cases rather than its own top-level nav item, mirroring
// desktop's own CasesManagementTemplate nesting (per
// docs/backend-saas/phase-3-core-pages/design.md).
export default async function CaseTemplatesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const actor: Actor = {
    id: session.user.id,
    role: ((session.user as { role?: string }).role as Actor["role"]) ?? "flat",
    firmId: (session.user as { firmId?: string | null }).firmId ?? null,
  };

  const templates = await listVisibleCaseTemplates(actor);
  return <TemplatesListClient initialTemplates={templates} canManage={canManageTemplates(actor)} />;
}
