import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ascurix Back Office",
  description: "Internal back office for Ascurix",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
