import { LogOut, Settings, User, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type MainTopBarUserProps = {
  // null = not signed in -- renders a "Log in" link instead of the
  // name/avatar/dropdown, since the portal no longer requires login to browse.
  userName: string | null;
  tier?: string | null;
  handleLogout: () => void;
}

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
        className="text-sm font-semibold text-teal-200 hover:text-white transition-colors cursor-pointer"
      >
        Log in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">

      <span className="text-sm font-semibold text-teal-200 select-none">
        {userName} <span className="text-teal-400">({tier === "pro" ? "PRO" : "FREE"})</span>
      </span>

      <div className="relative w-fit" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center justify-center w-9 h-9 rounded-full border border-teal-900 hover:border-teal-700 bg-teal-900/40 text-teal-200 hover:text-white transition-all cursor-pointer"
        >
          <User className="w-4 h-4" />
        </button>

        {dropdownOpen && (
          <div className="absolute right-[-18px] mt-2 w-28 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50">
          <Link
            href="/templates"
            onClick={() => setDropdownOpen(false)}
            className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            Templates
          </Link>
          <button
            onClick={() => {
              setDropdownOpen(false);
              alert("Profile page coming soon!");
            }}
            className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
          >
            <User className="w-3.5 h-3.5" />
            Profile
          </button>
          <button
            onClick={() => {
              setDropdownOpen(false);
              alert("Settings page coming soon!");
            }}
            className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </button>
          <div className="border-t border-slate-100 my-1"></div>
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
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