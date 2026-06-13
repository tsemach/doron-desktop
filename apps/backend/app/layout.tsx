import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Doron Desktop Portal",
  description: "Download the Doron Desktop application",
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
