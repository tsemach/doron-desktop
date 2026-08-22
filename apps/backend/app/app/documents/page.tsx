import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import SearchClient from "@/components/app/documents/SearchClient";

// Global search across every case's indexed documents (Phase 5). Per-case
// document management (connect folder, browse, open) lives in the
// case-detail Documents tab (Phase 4) -- this page is search only.
export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return <SearchClient />;
}
