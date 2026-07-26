import type { Metadata } from "next";
import "./globals.css";
import AuthSessionProvider from "../components/AuthSessionProvider";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Amicus",
  description: "Sign in or create your Amicus account",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AuthSessionProvider>{children}</AuthSessionProvider>
        </Providers>
      </body>
    </html>
  );
}
