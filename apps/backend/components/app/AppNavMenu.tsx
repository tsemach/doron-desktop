"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, CalendarClock, CreditCard, FileText, ListChecks, type LucideIcon } from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Cases", href: "/app/cases", icon: Briefcase },
  { label: "Tasks", href: "/app/tasks", icon: ListChecks },
  { label: "Calendar", href: "/app/calendar", icon: CalendarClock },
  { label: "Billing", href: "/app/billing", icon: CreditCard },
  { label: "Documents", href: "/app/documents", icon: FileText },
];

export default function AppNavMenu() {
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex items-center bg-muted/60 p-1 rounded-lg border border-border/40">
      {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 flex items-center gap-1.5 ${
              active
                ? "bg-background text-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
