import React, { createContext, useContext, useState, useEffect } from "react";

export const FONT_STORAGE_KEY = "app_font";

export type AppFont = "plex" | "assistant" | "noto" | "frank" | "rubik" | "heebo";

export interface FontOption {
  id: AppFont;
  label: string;
  /** Hebrew-range-only family; leads both stacks so size-adjust and the
   *  proportional-Hebrew-in-mono fix apply without touching Latin. */
  hebrew: string;
  /** Full family supplying Latin, digits and punctuation. */
  latin: string;
  note: string;
}

export const FONT_OPTIONS: FontOption[] = [
  { id: "plex", label: "IBM Plex Sans Hebrew", hebrew: "IBM Plex Hebrew Only", latin: "IBM Plex Sans Hebrew", note: "Institutional and precise" },
  { id: "assistant", label: "Assistant", hebrew: "Assistant Hebrew Only", latin: "Assistant Variable", note: "Humanist and warm" },
  { id: "noto", label: "Noto Sans Hebrew", hebrew: "Noto Hebrew Only", latin: "Noto Sans Hebrew Variable", note: "Neutral and complete" },
  { id: "frank", label: "Frank Ruhl Libre", hebrew: "Frank Hebrew Only", latin: "Frank Ruhl Libre Variable", note: "Serif, editorial" },
  { id: "rubik", label: "Rubik", hebrew: "Rubik Hebrew Only", latin: "Rubik Variable", note: "Rounded and friendly" },
  { id: "heebo", label: "Heebo", hebrew: "Heebo Hebrew Only", latin: "Heebo Variable", note: "Familiar and low-key" },
];

export const DEFAULT_FONT: AppFont = "plex";

export function getFontOption(id: AppFont): FontOption {
  return FONT_OPTIONS.find((f) => f.id === id) ?? FONT_OPTIONS[0];
}

/** Full font-family stack for a given option, Hebrew face first. */
export function buildFontStack(id: AppFont): string {
  const { hebrew, latin } = getFontOption(id);
  return `"${hebrew}", "${latin}", ui-sans-serif, system-ui, sans-serif`;
}

function applyFont(id: AppFont) {
  const { hebrew } = getFontOption(id);
  const root = document.documentElement;
  root.style.setProperty("--app-font-sans", buildFontStack(id));
  root.style.setProperty("--app-font-hebrew", `"${hebrew}"`);
}

interface FontContextProps {
  font: AppFont;
  setFont: (font: AppFont) => void;
}

const FontContext = createContext<FontContextProps | undefined>(undefined);

export function FontProvider({ children }: { children: React.ReactNode }) {
  const [font, setFontState] = useState<AppFont>(() => {
    const stored = localStorage.getItem(FONT_STORAGE_KEY) as AppFont | null;
    return FONT_OPTIONS.some((f) => f.id === stored) ? (stored as AppFont) : DEFAULT_FONT;
  });

  useEffect(() => {
    applyFont(font);
  }, [font]);

  function setFont(next: AppFont) {
    localStorage.setItem(FONT_STORAGE_KEY, next);
    setFontState(next);
  }

  return <FontContext.Provider value={{ font, setFont }}>{children}</FontContext.Provider>;
}

export function useFont() {
  const context = useContext(FontContext);
  if (!context) {
    throw new Error("useFont must be used within a FontProvider");
  }
  return context;
}
