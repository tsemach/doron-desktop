import type { Metadata } from "next";
import "./globals.css";
import AuthSessionProvider from "../components/AuthSessionProvider";

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
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
