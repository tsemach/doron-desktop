"use client";

import Link from "next/link";
import MainTopBarUser from "./MainTopBarUser";
import MainTopBarLogo from "./MainTopBarLogo";
import MainTopBarResourcesDropdown from "./MainTopBarResourcesDropdown";

type Props = {
  userName: string | null;
  tier?: string | null;
  handleLogout: () => void;
  // Forwarded to MainTopBarLogo -- see its comment. Only app/page.tsx passes
  // "dark" (it's pinned to dark mode); every other page keeps the default.
  logoVariant?: "dark" | "light";
}

const NAV_LINKS = [
  { label: "Products", href: "/products" },
  { label: "Download", href: "/download" },
  { label: "Pricing", href: "/pricing" },
];

export default function MainTopBar({ userName, tier, handleLogout, logoVariant }: Props) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-8">
        <MainTopBarLogo variant={logoVariant} />
        <nav className="flex items-center gap-6">
          {NAV_LINKS.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              {label}
            </Link>
          ))}
          <MainTopBarResourcesDropdown />
        </nav>
      </div>
      <MainTopBarUser userName={userName} tier={tier} handleLogout={handleLogout} />
    </header>
  );
}
