import Link from "next/link";
import { Briefcase, FileText, Home, LayoutTemplate } from "lucide-react";

// Matches desktop's CasesManagementSidebar.tsx structure: narrow icon+label
// rail. "Task Templates" isn't included -- that page doesn't exist yet in
// this backend (only case templates are built), so it's omitted rather
// than linked somewhere broken.
const NAV_ITEMS = [
  { href: "/app/cases", label: "Open Cases", icon: Briefcase },
  { href: "/app/cases/templates", label: "Case Templates", icon: LayoutTemplate },
];

export default function CasesSidebar() {
  return (
    <aside className="w-28 shrink-0 flex flex-col py-4 px-2 border-r border-border min-h-[600px]">
      <Link href="/app" className="flex flex-col items-center gap-1 text-xs text-muted-foreground hover:text-foreground py-2">
        <Home className="size-4" />
        Main
      </Link>
      <div className="my-2 border-t border-border" />
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="w-full h-16 flex flex-col items-center justify-center gap-1 text-xs rounded-md hover:bg-muted text-muted-foreground hover:text-foreground text-center px-1"
          >
            <Icon className="size-4" />
            {label.split(" ").map((word) => (
              <span key={word}>{word}</span>
            ))}
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex items-center gap-2 px-1 py-2 text-xs text-muted-foreground">
        <FileText className="size-4 shrink-0" />
      </div>
    </aside>
  );
}
