"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, CalendarClock, CreditCard, FileText, LayoutDashboard, type LucideIcon } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import type { TranslationKey } from "../../locales/translations";

type NavItem = {
  labelKey: TranslationKey;
  href: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { labelKey: "nav_home", href: "/app", icon: LayoutDashboard },
  { labelKey: "nav_cases", href: "/app/cases", icon: Briefcase },
  { labelKey: "nav_calendar", href: "/app/calendar", icon: CalendarClock },
  { labelKey: "nav_billing", href: "/app/billing", icon: CreditCard },
  { labelKey: "nav_documents", href: "/app/documents", icon: FileText },
];

export default function AppNavMenu() {
  const { t } = useLanguage();
  const pathname = usePathname();

  return (
    <nav className="hidden md:flex items-center bg-muted/60 p-1 rounded-lg border border-border/40">
      {NAV_ITEMS.map(({ labelKey, href, icon: Icon }) => {
        const active =
          href === "/app" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
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
            {t(labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
