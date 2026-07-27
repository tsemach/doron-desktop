import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import "./globals.css";
import AuthSessionProvider from "../components/AuthSessionProvider";
import Providers from "./providers";

// Elegant serif used sparingly for display headings (see --font-display in
// globals.css) -- the body keeps the default sans stack.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-fraunces",
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
    <html lang="en" className={fraunces.variable}>
      <body>
        <Providers>
          <AuthSessionProvider>{children}</AuthSessionProvider>
        </Providers>
      </body>
    </html>
  );
}
