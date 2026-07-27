import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Amicus Back Office",
  description: "Internal back office for Amicus",
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
