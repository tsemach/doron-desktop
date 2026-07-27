"use client";

import { useRouter, usePathname } from "next/navigation";
import { Button } from "@workspace/ui";

// Vertical nav, same layout pattern as apps/desktop's CaseManagementSidebar
// (apps/desktop/src/components/CaseManagement/CasesManagementSidebar.tsx) --
// adapted from react-router-dom to next/navigation. Plain button + router.push
// (not a <Link>-wrapped button) to match that reference exactly -- wrapping
// in an <a> made the text inherit the browser's default link color/underline
// instead of the button's own styling.
export default function OfficeSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const isTemplatesActive = pathname.startsWith("/templates");

  return (
    <aside className="w-40 shrink-0 flex flex-col py-4 px-3 border-r border-border">
      <div className="flex flex-col gap-3">
        <Button
          variant="ghost"
          onClick={() => router.push("/templates")}
          className={`w-full h-24 flex flex-col items-center justify-center text-center whitespace-normal break-words px-4 font-normal border border-border text-foreground ${
            isTemplatesActive ? "bg-accent font-semibold" : ""
          }`}
        >
          Templates
        </Button>
      </div>
    </aside>
  );
}
