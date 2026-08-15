"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, BookOpen, Info } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import type { TranslationKey } from "../../locales/translations";

const RESOURCES_LINKS: { labelKey: TranslationKey; href: string; icon: typeof Sparkles }[] = [
  { labelKey: "nav_key_features", href: "/resources/key-features", icon: Sparkles },
  { labelKey: "nav_documentation", href: "/resources/documentation", icon: BookOpen },
  { labelKey: "nav_about", href: "/resources/about", icon: Info },
];

// Same open/close-on-outside-click pattern as MainTopBarUser's dropdown.
export default function MainTopBarResourcesDropdown() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        {t("nav_resources")}
      </button>

      {open && (
        <div className="absolute left-0 rtl:left-auto rtl:right-0 mt-2 w-48 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
          {RESOURCES_LINKS.map(({ labelKey, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/60 cursor-pointer"
            >
              <Icon className="w-3.5 h-3.5" />
              {t(labelKey)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
