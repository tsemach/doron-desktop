import en from "./en.json";
import he from "./he.json";

export const translations = {
  en,
  he
};

export type Language = "en" | "he";
export type TranslationKey = keyof typeof en;
