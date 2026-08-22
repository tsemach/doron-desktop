"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BetaBadge } from "@workspace/ui";

const TABS = [
  { href: "/app/documents", label: "Smart Search" },
  { href: "/app/documents/scan", label: "Scan & Index" },
  { href: "/app/documents/templates", label: "Documents Templates" },
];

// Matches desktop's DocsManagementHeader.tsx structure/classes (gradient
// title, tri-tab pill nav).
export default function DocsHeader() {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-md px-6 py-4">
      <div className="grid grid-cols-3 items-center">
        <div>
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-muted-foreground bg-clip-text text-transparent inline-block">
            Documents Vault
            <BetaBadge />
          </h1>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Enterprise Document AI</p>
        </div>
        <nav className="justify-self-center flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/40">
          {TABS.map(({ href, label }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  active ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <div />
      </div>
    </div>
  );
}
