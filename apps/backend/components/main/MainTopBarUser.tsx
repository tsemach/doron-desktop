import { LogOut, Settings, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type MainTopBarUserProps = {
  // null = not signed in -- renders a "Log in" link instead of the
  // name/avatar/dropdown, since the portal no longer requires login to browse.
  userName: string | null;
  tier?: string | null;
  handleLogout: () => void;
}

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  ultra: "Ultra",
};

export default function MainTopBarUser({ userName, tier, handleLogout }: MainTopBarUserProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
      <Link
        href="/login"
        className="text-sm font-semibold text-foreground hover:text-primary transition-colors cursor-pointer"
      >
        Log in
      </Link>
    );
  }

  const tierLabel = TIER_LABELS[tier ?? "free"] ?? "Free";
  const isUpgradeable = tier !== "pro" && tier !== "ultra";

  return (
    <div className="flex items-center gap-3">

      <span className="text-sm font-semibold text-foreground select-none">
        {userName} <span className="text-muted-foreground">({tierLabel})</span>
      </span>

      {isUpgradeable && (
        <Link
          href="/register/plan"
          className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
        >
          Upgrade
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
          <div className="absolute right-[-18px] mt-2 w-28 bg-popover border border-border rounded-lg shadow-lg py-1 z-50">
          <Link
            href="/profile"
            onClick={() => setDropdownOpen(false)}
            className="w-full text-left px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/60 flex items-center gap-2 cursor-pointer"
          >
            <User className="w-3.5 h-3.5" />
            Profile
          </Link>
          <button
            onClick={() => {
              setDropdownOpen(false);
              alert("Settings page coming soon!");
            }}
            className="w-full text-left px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/60 flex items-center gap-2 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </button>
          <div className="border-t border-border my-1"></div>
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 flex items-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
        )}
      </div>
    </div>
  )
}
