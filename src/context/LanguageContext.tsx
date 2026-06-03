import React, { createContext, useContext, useState, useEffect } from "react";
import { translations, Language, TranslationKey } from "../locales/translations";

export const LANGUAGE_STORAGE_KEY = "app_language";

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey) => string;
  dir: "ltr" | "rtl";
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return (stored === "he" ? "he" : "en") as Language;
  });

  const dir = language === "he" ? "rtl" : "ltr";

  useEffect(() => {
    // Sync document elements to set correct layouts
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
  }, [language, dir]);

  function setLanguage(lang: Language) {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    setLanguageState(lang);
  }

  function t(key: TranslationKey): string {
    const dict = translations[language] || translations.en;
    const value = dict[key];
    if (value !== undefined) {
      return value;
    }
    // Fallback to English translation
    const fallbackDict = translations.en;
    const fallbackValue = fallbackDict[key];
    if (fallbackValue !== undefined) {
      return fallbackValue;
    }
    return String(key);
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, dir }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
