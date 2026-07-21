import { useState, type ReactNode } from "react";
import { Button } from "./button";

export interface KebabMenuItem {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive";
  /** Highlights the item to reflect an already-active state (e.g. a toggled tab). */
  active?: boolean;
  hidden?: boolean;
}

interface KebabMenuProps {
  items: KebabMenuItem[];
  triggerClassName?: string;
  title?: string;
  /** Overrides the default 3-dot trigger icon (e.g. a User icon for an account menu). */
  triggerIcon?: ReactNode;
}

export default function KebabMenu({ items, triggerClassName, title, triggerIcon }: KebabMenuProps) {
  const [open, setOpen] = useState(false);
  const visibleItems = items.filter((item) => !item.hidden);

  if (visibleItems.length === 0) return null;

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName ?? "h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted"}
        title={title ?? "More options"}
      >
        {triggerIcon ?? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="1.2" fill="currentColor" />
            <circle cx="12" cy="5" r="1.2" fill="currentColor" />
            <circle cx="12" cy="19" r="1.2" fill="currentColor" />
          </svg>
        )}
      </Button>

      {open && (
        <>
          {/* Invisible overlay to close dropdown on click outside */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />

          <div className="absolute right-0 mt-1.5 w-52 rounded-lg border border-border bg-card shadow-lg py-1 z-40 animate-in fade-in slide-in-from-top-1 duration-100">
            {visibleItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`w-full px-3 py-2 text-left text-xs font-semibold hover:bg-muted transition-colors flex items-center gap-2 cursor-pointer bg-transparent border-none ${
                  item.variant === "destructive"
                    ? "text-destructive hover:bg-destructive/10"
                    : item.active
                    ? "text-primary bg-primary/5"
                    : "text-foreground"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
