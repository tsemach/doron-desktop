"use client";

import Link from "next/link";
import { useLanguage } from "../../context/LanguageContext";
import type { TranslationKey } from "../../locales/translations";

// Placeholder contact/social content -- no support email or social links
// exist anywhere else in the codebase yet (see docs/marketing-redesign/plan.md,
// "Footer content" decision). Swap for real details when available.
const NAV_LINKS: { labelKey: TranslationKey; href: string }[] = [
  { labelKey: "nav_products", href: "/products" },
  { labelKey: "nav_pricing", href: "/pricing" },
  { labelKey: "nav_key_features", href: "/resources/key-features" },
  { labelKey: "nav_download", href: "/download" },
];

const RESOURCE_LINKS: { labelKey: TranslationKey; href: string }[] = [
  { labelKey: "nav_documentation", href: "/resources/documentation" },
  { labelKey: "nav_about", href: "/resources/about" },
];

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="w-full bg-slate-900 text-slate-300">
      <div className="max-w-6xl mx-auto px-6 py-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
        <div>
          <span className="flex items-center gap-2 text-sm font-bold text-white mb-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-accent text-brand-accent-foreground text-xs font-semibold">
              A
            </span>
            <span>{t("app_name")}</span>
          </span>
          <p className="text-sm text-slate-400 leading-relaxed max-w-xs">{t("footer_tagline")}</p>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">{t("footer_navigate")}</h4>
          <ul className="space-y-2.5">
            {NAV_LINKS.map(({ labelKey, href }) => (
              <li key={href}>
                <Link href={href} className="text-sm text-slate-300 hover:text-brand-accent transition-colors">
                  {t(labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">{t("footer_resources")}</h4>
          <ul className="space-y-2.5">
            {RESOURCE_LINKS.map(({ labelKey, href }) => (
              <li key={href}>
                <Link href={href} className="text-sm text-slate-300 hover:text-brand-accent transition-colors">
                  {t(labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">{t("footer_contact")}</h4>
          {/* TODO: placeholder contact/social -- replace with real details */}
          <ul className="space-y-2.5 text-sm text-slate-300">
            <li>support@ascurix.com</li>
            <li className="text-slate-500">{t("footer_social_todo")}</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-800">
        <p className="max-w-6xl mx-auto px-6 py-5 text-xs text-slate-500">
          © {new Date().getFullYear()} {t("app_name")}. {t("footer_rights")}
        </p>
      </div>
    </footer>
  );
}
