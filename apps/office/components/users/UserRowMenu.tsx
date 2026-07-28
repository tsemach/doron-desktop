"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";

interface UserRowMenuProps {
  onEdit: () => void;
  onDelete: () => void;
}

const MENU_WIDTH = 160; // matches w-40

// Rendered via a portal into document.body, positioned from the trigger
// button's actual screen coordinates -- the table this lives in has
// overflow-x-auto (for horizontal scrolling on narrow screens), and setting
// only overflow-x implicitly clips overflow-y too (per the CSS overflow
// spec), which was cutting the dropdown down to nothing when it was just a
// normal absolutely-positioned child.
export default function UserRowMenu({ onEdit, onDelete }: UserRowMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickAway = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleClose = () => setOpen(false);

    document.addEventListener("mousedown", handleClickAway);
    window.addEventListener("scroll", handleClose, true);
    window.addEventListener("resize", handleClose);
    return () => {
      document.removeEventListener("mousedown", handleClickAway);
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("resize", handleClose);
    };
  }, [open]);

  const toggleOpen = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 4, left: rect.right - MENU_WIDTH });
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-md transition-colors"
        title="Actions"
      >
        <MoreVertical className="size-4" />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: position.top, left: position.left, width: MENU_WIDTH }}
            className="z-50 bg-white border border-slate-200 rounded-md shadow-lg py-1"
          >
            <button
              onClick={() => {
                setOpen(false);
                onEdit();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Pencil className="size-4" />
              Edit user
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="size-4" />
              Delete user
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
