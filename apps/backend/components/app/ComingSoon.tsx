"use client";

import { Sparkles } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import type { TranslationKey } from "../../locales/translations";

type ComingSoonProps = {
  // A translation key rather than a literal string, so the callers (several
  // of which are Server Components) don't each need their own "use client" +
  // useLanguage() just to translate a one-word feature name.
  featureKey: TranslationKey;
};

export default function ComingSoon({ featureKey }: ComingSoonProps) {
  const { t } = useLanguage();

  return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-4">
        <Sparkles className="h-6 w-6" />
      </span>
      <h1 className="text-xl font-bold text-foreground">
        {t(featureKey)} {t("coming_soon_suffix")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("coming_soon_desc")}</p>
    </div>
  );
}
