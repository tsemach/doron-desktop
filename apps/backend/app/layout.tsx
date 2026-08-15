import type { Metadata } from "next";
import { Fraunces, Rubik } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import AuthSessionProvider from "../components/AuthSessionProvider";
import Providers from "./providers";
import ConditionalFooter from "@/components/ConditionalFooter";
import { auth } from "../auth";
import { LanguageProvider, LOCALE_COOKIE_KEY } from "../context/LanguageContext";
import { FontProvider, DEFAULT_FONT, type AppFont } from "../context/FontContext";
import { APP_FONT_CLASS_NAMES } from "../lib/fonts";
import type { Language } from "../locales/translations";

// Elegant serif used sparingly for display headings (see --font-display in
// globals.css) -- the body keeps the default sans stack.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-fraunces",
});

// Same "Rubik -- Rounded and friendly" interface font the desktop app offers
// (apps/desktop/src/context/FontContext.tsx, loaded there via
// @fontsource-variable/rubik) -- loaded here via next/font/google instead
// since this is a single fixed choice for dashboard headings, not a
// user-selectable runtime option like on desktop. See --font-heading in
// globals.css.
const rubik = Rubik({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-rubik",
});

export const metadata: Metadata = {
  title: "Ascurix",
  description: "Sign in or create your Ascurix account",
};

// ASC-157 -- resolves the interface language/font once per full page load
// (session for signed-in users, else the anonymous `app_locale` cookie set
// by the public nav's toggle, else Hebrew -- Ascurix's marketing/auth pages
// are Hebrew-first for signed-out visitors) so <html lang dir> and the
// initial copy are already correct server-side -- no flash of the wrong
// language.
const ANONYMOUS_DEFAULT_LANGUAGE: Language = "he";

async function resolvePreferences(): Promise<{ language: Language; font: AppFont }> {
  const session = await auth();
  const sessionUser = session?.user as { locale?: string; interfaceFont?: string } | undefined;
  if (sessionUser) {
    return {
      language: sessionUser.locale === "he" ? "he" : "en",
      font: sessionUser.interfaceFont as AppFont | undefined ?? DEFAULT_FONT,
    };
  }

  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_KEY)?.value;
  const language: Language =
    cookieLocale === "he" || cookieLocale === "en" ? cookieLocale : ANONYMOUS_DEFAULT_LANGUAGE;
  return { language, font: DEFAULT_FONT };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { language, font } = await resolvePreferences();
  const dir = language === "he" ? "rtl" : "ltr";

  return (
    <html lang={language} dir={dir} className={`${fraunces.variable} ${rubik.variable} ${APP_FONT_CLASS_NAMES}`}>
      <body>
        <Providers>
          <AuthSessionProvider>
            <LanguageProvider initialLanguage={language}>
              <FontProvider initialFont={font}>
                {children}
                <ConditionalFooter />
              </FontProvider>
            </LanguageProvider>
          </AuthSessionProvider>
        </Providers>
      </body>
    </html>
  );
}
