"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

// Mirrors apps/desktop/src/context/FontContext.tsx's API (font/setFont/
// FONT_OPTIONS/buildFontStack), adapted for Next.js: the six families are
// preloaded as next/font/google variables in lib/fonts.ts, so buildFontStack
// just references the matching CSS variable instead of concatenating a
// Hebrew-only + Latin-only family pair. Initial value comes from the DB
// (via a server-resolved `initialFont` prop, see app/layout.tsx) instead of
// localStorage.
export type AppFont = "plex" | "assistant" | "noto" | "frank" | "rubik" | "heebo";

export interface FontOption {
  id: AppFont;
  label: string;
  cssVar: string;
  note: string;
}

export const FONT_OPTIONS: FontOption[] = [
  { id: "plex", label: "IBM Plex Sans Hebrew", cssVar: "--font-plex", note: "Institutional and precise" },
  { id: "assistant", label: "Assistant", cssVar: "--font-assistant", note: "Humanist and warm" },
  { id: "noto", label: "Noto Sans Hebrew", cssVar: "--font-noto", note: "Neutral and complete" },
  { id: "frank", label: "Frank Ruhl Libre", cssVar: "--font-frank", note: "Serif, editorial" },
  { id: "rubik", label: "Rubik", cssVar: "--font-rubik-interface", note: "Rounded and friendly" },
  { id: "heebo", label: "Heebo", cssVar: "--font-heebo", note: "Familiar and low-key" },
];

export const DEFAULT_FONT: AppFont = "plex";

export function getFontOption(id: AppFont): FontOption {
  return FONT_OPTIONS.find((f) => f.id === id) ?? FONT_OPTIONS[0];
}

/** Full font-family value for a given option -- a single next/font variable
 *  (already covering both scripts) plus the generic fallback stack. */
export function buildFontStack(id: AppFont): string {
  const { cssVar } = getFontOption(id);
  return `var(${cssVar}), ui-sans-serif, system-ui, sans-serif`;
}

function applyFont(id: AppFont) {
  document.documentElement.style.setProperty("--app-font-sans", buildFontStack(id));
}

interface FontContextProps {
  font: AppFont;
  setFont: (font: AppFont) => void;
}

const FontContext = createContext<FontContextProps | undefined>(undefined);

export function FontProvider({ initialFont, children }: { initialFont: AppFont; children: React.ReactNode }) {
  const [font, setFontState] = useState<AppFont>(initialFont);

  useEffect(() => {
    applyFont(font);
  }, [font]);

  function setFont(next: AppFont) {
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
