"use client";

import { signOut } from "next-auth/react";
import MainTopBarLogo from "@/components/main/MainTopBarLogo";
import MainTopBarUser from "@/components/main/MainTopBarUser";

type AppTopBarProps = {
  userName: string | null;
  tier?: string | null;
};

export default function AppTopBar({ userName, tier }: AppTopBarProps) {
  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md px-6 py-3 flex items-center justify-between">
      <MainTopBarLogo href="/home" />
      <MainTopBarUser userName={userName} tier={tier} handleLogout={handleLogout} />
    </header>
  );
}
