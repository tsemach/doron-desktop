import { redirect } from "next/navigation";

// Redirects to the real templates page (Phase 3, nested under Cases) --
// this tab exists for visual/navigational parity with desktop's tri-tab
// header, not as a second copy of the templates feature.
export default function DocumentsTemplatesPage() {
  redirect("/app/cases/templates");
}
