import { redirect } from "next/navigation";
import { auth } from "../../../../auth";
import { listVisibleCases } from "../../../../lib/cases/crud";
import type { Actor } from "../../../../lib/permissions";
import DocsHeader from "@/components/app/documents/DocsHeader";
import ScanIndexClient from "@/components/app/documents/ScanIndexClient";

export default async function ScanPage() {
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

  return (
    <div className="flex flex-col min-h-screen">
      <DocsHeader />
      <ScanIndexClient cases={cases.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
