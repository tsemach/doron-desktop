import { LayoutDashboard, LogOut, Settings, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "../../context/LanguageContext";
import LanguageToggle from "./LanguageToggle";

type MainTopBarUserProps = {
  // null = not signed in -- renders a "Log in" link instead of the
  // name/avatar/dropdown, since the portal no longer requires login to browse.
  userName: string | null;
  tier?: string | null;
  workspaceLabel?: string | null;
  handleLogout: () => void;
}

export default function MainTopBarUser({ userName, tier, workspaceLabel, handleLogout }: MainTopBarUserProps) {
  const { t } = useLanguage();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isInWorkspace = pathname === "/app" || pathname.startsWith("/app/");

  const tierLabels: Record<string, string> = {
    free: t("tier_free"),
    pro: t("tier_pro"),
    ultra: t("tier_ultra"),
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  if (!userName) {
    return (
      <div className="flex items-center gap-3">
        <LanguageToggle />
        <Link
          href="/login"
          className="text-sm font-semibold text-foreground hover:text-primary transition-colors cursor-pointer"
        >
          {t("nav_login")}
        </Link>
      </div>
    );
  }

  const tierLabel = tierLabels[tier ?? "free"] ?? t("tier_free");
  const isUpgradeable = tier !== "pro" && tier !== "ultra";

  return (
    <div className="flex items-center gap-3">

      {!isInWorkspace && (
        <Link
          href="/app"
          className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border border-brand-accent text-brand-accent hover:bg-brand-accent/10 transition-all cursor-pointer"
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          {t("nav_desktop")}
        </Link>
      )}

      <div className="flex flex-col leading-tight select-none">
        <span className="text-sm font-semibold text-foreground">
          {userName} <span className="text-muted-foreground">({tierLabel})</span>
        </span>
        {workspaceLabel && <span className="text-xs text-muted-foreground">{workspaceLabel}</span>}
      </div>

      {isUpgradeable && (
        <Link
          href="/register/plan"
          className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
        >
          {t("nav_upgrade")}
        </Link>
      )}

      <div className="relative w-fit" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center justify-center w-9 h-9 rounded-full border border-border hover:border-foreground/30 bg-muted/60 text-foreground hover:text-foreground transition-all cursor-pointer"
        >
          <User className="w-4 h-4" />
        </button>

        {dropdownOpen && (
          <div className="absolute right-[-18px] rtl:right-auto rtl:left-[-18px] mt-2 w-28 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
          <Link
            href="/profile"
            onClick={() => setDropdownOpen(false)}
            className="w-full text-left rtl:text-right px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/60 flex items-center gap-2 cursor-pointer"
          >
            <User className="w-3.5 h-3.5" />
            {t("nav_profile")}
          </Link>
          <button
            onClick={() => {
              setDropdownOpen(false);
              alert(t("nav_settings_coming_soon"));
            }}
            className="w-full text-left rtl:text-right px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/60 flex items-center gap-2 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            {t("nav_settings")}
          </button>
          <div className="border-t border-border my-1"></div>
          <button
            onClick={handleLogout}
            className="w-full text-left rtl:text-right px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 flex items-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            {t("nav_logout")}
          </button>
        </div>
        )}
      </div>
    </div>
  )
}
