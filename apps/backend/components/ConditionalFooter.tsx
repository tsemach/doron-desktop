"use client";

import { usePathname } from "next/navigation";
import Footer from "@/components/marketing/Footer";

// The /app private workspace has never had its own footer design -- it
// inherited the marketing site's by accident (parked as a known issue in
// ASC-105 sub-project 1). Hide it there rather than deleting Footer, since
// every marketing page still needs it.
export default function ConditionalFooter() {
  const pathname = usePathname();
  const isAppShell = pathname === "/app" || pathname.startsWith("/app/");

  if (isAppShell) {
    return null;
  }

  return <Footer />;
}
