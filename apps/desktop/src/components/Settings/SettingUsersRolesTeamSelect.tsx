import { useEffect, useRef, useState } from "react";
import type { TeamEntry } from "./SettingUsersRolesTeamPanel";

interface SettingUsersRolesTeamSelectProps {
  id?: string;
  teams: TeamEntry[];
  value: string;
  onChange: (teamId: string) => void;
}

// A native <select>'s <option> can't host a colored dot (or any child
// element) in any browser -- this is a small custom listbox instead, built
// only for this one case where the dot actually matters.
export default function SettingUsersRolesTeamSelect({ id, teams, value, onChange }: SettingUsersRolesTeamSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = teams.find((t) => t.id === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center gap-2 rounded-md border border-input bg-background pl-3 pr-9 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
      >
        {selected && <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: selected.color || "#64748b" }} />}
        <span className="truncate">{selected?.name}</span>
      </button>
      <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-muted-foreground">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>

      {open && (
        <div
          role="listbox"
          className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-md border border-border bg-card shadow-lg py-1 animate-in fade-in zoom-in-95 duration-100"
        >
          {teams.map((t) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={t.id === value}
              onClick={() => {
                onChange(t.id);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left cursor-pointer hover:bg-muted ${
                t.id === value ? "bg-muted font-semibold" : ""
              }`}
            >
              <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color || "#64748b" }} />
              <span className="truncate text-foreground">{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
