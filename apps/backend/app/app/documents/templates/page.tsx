import { redirect } from "next/navigation";
import { auth } from "../../../../auth";
import { canManageTemplates } from "../../../../lib/templates/crud";
import { listVisibleDocTemplates } from "../../../../lib/docTemplates/crud";
import type { Actor } from "../../../../lib/permissions";
import DocsHeader from "@/components/app/documents/DocsHeader";
import DocTemplatesListClient from "@/components/app/documents/DocTemplatesListClient";

// Individual document templates (a single placeholder-fillable file) --
// distinct from case templates (a collection of these), which are managed
// under Cases at /app/cases/templates. See lib/docTemplates/crud.ts.
export default async function DocumentsTemplatesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const actor: Actor = {
    id: session.user.id,
    role: ((session.user as { role?: string }).role as Actor["role"]) ?? "flat",
    firmId: (session.user as { firmId?: string | null }).firmId ?? null,
  };

  const templates = await listVisibleDocTemplates(actor);

  return (
    <div className="flex flex-col min-h-screen">
      <DocsHeader />
      <DocTemplatesListClient initialTemplates={templates} canManage={canManageTemplates(actor)} />
    </div>
  );
}
