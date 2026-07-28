"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut, User } from "lucide-react";

type UserMenuProps = {
  name?: string | null;
  email?: string | null;
};

export default function UserMenu({ name, email }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
    <div className="flex items-center gap-2">
      {(name || email) && <span className="text-sm font-semibold text-foreground select-none">{name || email}</span>}

      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="User menu"
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-accent"
        >
          <User className="h-4 w-4" />
        </button>

        {open && (
          <div className="absolute right-0 z-10 mt-2 w-56 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
            {email && <div className="truncate px-2 py-1.5 text-xs text-muted-foreground">{email}</div>}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-3.5 w-3.5" />
              Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
