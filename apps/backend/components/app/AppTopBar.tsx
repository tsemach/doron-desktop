"use client";

import { signOut } from "next-auth/react";
import TopBarShell from "@/components/main/TopBarShell";
import AppNavMenu from "@/components/app/AppNavMenu";

type AppTopBarProps = {
  userName: string | null;
  tier?: string | null;
  workspaceLabel?: string | null;
};

export default function AppTopBar({ userName, tier, workspaceLabel }: AppTopBarProps) {
  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  return (
    <TopBarShell
      logoHref="/home"
      centerNav
      userName={userName}
      tier={tier}
      workspaceLabel={workspaceLabel}
      handleLogout={handleLogout}
      nav={<AppNavMenu />}
    />
  );
}
