"use client";

import MainTopBarLogo from "./MainTopBarLogo";
import MainTopBarUser from "./MainTopBarUser";

type TopBarShellProps = {
  logoHref: string;
  nav: React.ReactNode;
  userName: string | null;
  tier?: string | null;
  workspaceLabel?: string | null;
  handleLogout: () => void;
};

export default function TopBarShell({ logoHref, nav, userName, tier, workspaceLabel, handleLogout }: TopBarShellProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-8">
        <MainTopBarLogo href={logoHref} />
        {nav}
      </div>
      <MainTopBarUser userName={userName} tier={tier} workspaceLabel={workspaceLabel} handleLogout={handleLogout} />
    </header>
  );
}
