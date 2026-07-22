"use client";

import Link from "next/link";
import MainTopBarUser from "./MainTopBarUser";
import MainTopBarLogo from "./MainTopBarLogo";

type Props = {
  userName: string | null;
  tier?: string | null;
  handleLogout: () => void;
}

const NAV_LINKS = [
  { label: "Products", href: "/products" },
  { label: "Download", href: "/download" },
  { label: "Pricing", href: "/pricing" },
  { label: "Show me how", href: "/show-me-how" },
];

export default function MainTopBar({ userName, tier, handleLogout }: Props) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-8">
        <MainTopBarLogo />
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
        </nav>
      </div>
      <MainTopBarUser userName={userName} tier={tier} handleLogout={handleLogout} />
    </header>
  );
}
