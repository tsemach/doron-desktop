import type { Metadata } from "next";
import { Fraunces, Rubik } from "next/font/google";
import "./globals.css";
import AuthSessionProvider from "../components/AuthSessionProvider";
import Providers from "./providers";
import ConditionalFooter from "@/components/ConditionalFooter";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${rubik.variable}`}>
      <body>
        <Providers>
          <AuthSessionProvider>{children}</AuthSessionProvider>
        </Providers>
        <ConditionalFooter />
      </body>
    </html>
  );
}
