"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { translations, Language, TranslationKey } from "../locales/translations";

// Mirrors apps/desktop/src/context/LanguageContext.tsx's API (language/
// setLanguage/t/dir), but the initial value comes from the server (session
// for signed-in users, `locale` cookie for anonymous ones -- see
// app/layout.tsx) instead of localStorage, so the first paint already has
// the right lang/dir/copy with no flash. setLanguage keeps mirroring that
// choice into the cookie on every change so it survives a hard reload before
// any DB write completes; persisting to the user's account is a separate,
// explicit step (the Profile page's Save button), not automatic here.
export const LOCALE_COOKIE_KEY = "app_locale";

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  dir: "ltr" | "rtl";
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export function LanguageProvider({
  initialLanguage,
  children,
}: {
  initialLanguage: Language;
  children: React.ReactNode;
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const dir = language === "he" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
  }, [language, dir]);

  function setLanguage(lang: Language) {
    document.cookie = `${LOCALE_COOKIE_KEY}=${lang}; path=/; max-age=31536000; SameSite=Lax`;
    setLanguageState(lang);
  }

  function t(key: TranslationKey): string {
    const dict = translations[language] || translations.en;
    const value = dict[key];
    if (value !== undefined) {
      return value;
    }
    const fallbackValue = translations.en[key];
    if (fallbackValue !== undefined) {
      return fallbackValue;
    }
    return String(key);
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, dir }}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
