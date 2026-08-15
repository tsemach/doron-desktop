import { IBM_Plex_Sans_Hebrew, Assistant, Noto_Sans_Hebrew, Frank_Ruhl_Libre, Rubik, Heebo } from "next/font/google";

// ASC-157 -- interface font picker (Profile > Preferences), same option set
// as apps/desktop/src/context/FontContext.tsx. Unlike desktop (which loads a
// Hebrew-only family and a Latin-only family per option via @fontsource and
// concatenates the two into one CSS stack), each of these next/font/google
// loaders requests both the "latin" and "hebrew" subsets directly, so one
// loader already covers both scripts -- no stack-concatenation needed, see
// context/FontContext.tsx's buildFontStack.
//
// Named `*Interface` to avoid colliding with app/layout.tsx's separate fixed
// `rubik` (--font-rubik, headings only, latin weights 500/600/700).
const plexInterface = IBM_Plex_Sans_Hebrew({
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex",
});
const assistantInterface = Assistant({
  subsets: ["latin", "hebrew"],
  variable: "--font-assistant",
});
const notoInterface = Noto_Sans_Hebrew({
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto",
});
const frankInterface = Frank_Ruhl_Libre({
  subsets: ["latin", "hebrew"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-frank",
});
const rubikInterface = Rubik({
  subsets: ["latin", "hebrew"],
  variable: "--font-rubik-interface",
});
const heeboInterface = Heebo({
  subsets: ["latin", "hebrew"],
  variable: "--font-heebo",
});

export const APP_FONT_LOADERS = [
  plexInterface,
  assistantInterface,
  notoInterface,
  frankInterface,
  rubikInterface,
  heeboInterface,
];

// Applied to <html> in app/layout.tsx so every option's CSS variable exists
// on the page regardless of which one is currently selected.
export const APP_FONT_CLASS_NAMES = APP_FONT_LOADERS.map((f) => f.variable).join(" ");
