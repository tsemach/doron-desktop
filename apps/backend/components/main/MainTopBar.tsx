"use client";

import Link from "next/link";
import TopBarShell from "./TopBarShell";
import MainTopBarResourcesDropdown from "./MainTopBarResourcesDropdown";
import { useLanguage } from "../../context/LanguageContext";
import type { TranslationKey } from "../../locales/translations";

type Props = {
  userName: string | null;
  tier?: string | null;
  handleLogout: () => void;
}

const NAV_LINKS: { labelKey: TranslationKey; href: string }[] = [
  { labelKey: "nav_products", href: "/products" },
  { labelKey: "nav_download", href: "/download" },
  { labelKey: "nav_pricing", href: "/pricing" },
];

export default function MainTopBar({ userName, tier, handleLogout }: Props) {
  const { t } = useLanguage();

  return (
    <TopBarShell
      logoHref="/home"
      userName={userName}
      tier={tier}
      handleLogout={handleLogout}
      nav={
        <nav className="flex items-center gap-6">
          {NAV_LINKS.map(({ labelKey, href }) => (
            <Link
              key={href}
              href={href}
              className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              {t(labelKey)}
            </Link>
          ))}
          <MainTopBarResourcesDropdown />
        </nav>
      }
    />
  );
}
