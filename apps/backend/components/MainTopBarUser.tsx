import { LogOut, Settings, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type MainTopBarUserProps = {
  userName: string;
  handleLogout: () => void;
}

export default function MainTopBarUser({ userName, handleLogout }: MainTopBarUserProps) {
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
  
  return (
    <div className="flex items-center gap-3">
      
      <span className="text-sm font-semibold text-slate-600 select-none">
        {userName}
      </span>
      
      <div className="relative w-fit" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center justify-center w-9 h-9 rounded-full border border-slate-300 hover:border-slate-400 bg-slate-50 text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
        >
          <User className="w-4 h-4" />
        </button>

        {dropdownOpen && (
          <div className="absolute right-[-18px] mt-2 w-28 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50">
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