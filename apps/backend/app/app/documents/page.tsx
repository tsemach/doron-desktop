import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import DocsHeader from "@/components/app/documents/DocsHeader";
import SearchClient from "@/components/app/documents/SearchClient";

// Global search across every case's indexed documents (Phase 5). Per-case
// document management (connect folder, browse) lives in the case-detail
// Documents tab (Phase 4) -- matches desktop's DocsManagement.tsx header/
// tab structure, but "Scan & Index" here explains that instead of
// duplicating the per-case action.
export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { q } = await searchParams;

  return (
    <div className="flex flex-col min-h-screen">
      <DocsHeader />
      <div className="flex-1 px-6">
        <SearchClient initialQuery={q} />
      </div>
    </div>
  );
}
