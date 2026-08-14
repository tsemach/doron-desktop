"use client";

import MainTopBarLogo from "./MainTopBarLogo";
import MainTopBarUser from "./MainTopBarUser";

type TopBarShellProps = {
  logoHref: string;
  nav: React.ReactNode;
  // True positioning (not just "next to the logo") -- callers that want the
  // nav visually centered in the header regardless of logo/user width (the
  // dashboard's AppNavMenu) opt in; omitting it keeps the original
  // logo+nav-grouped-left layout (marketing's MainTopBar) byte-identical.
  centerNav?: boolean;
  userName: string | null;
  tier?: string | null;
  workspaceLabel?: string | null;
  handleLogout: () => void;
};

export default function TopBarShell({
  logoHref,
  nav,
  centerNav,
  userName,
  tier,
  workspaceLabel,
  handleLogout,
}: TopBarShellProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md px-6 py-3 flex items-center justify-between relative">
      {centerNav ? (
        <>
          <MainTopBarLogo href={logoHref} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">{nav}</div>
        </>
      ) : (
        <div className="flex items-center gap-8">
          <MainTopBarLogo href={logoHref} />
          {nav}
        </div>
      )}
      <MainTopBarUser userName={userName} tier={tier} workspaceLabel={workspaceLabel} handleLogout={handleLogout} />
    </header>
  );
}
