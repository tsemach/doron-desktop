"use client";

import { createPortal } from "react-dom";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Replaces the browser's native window.confirm() with a styled modal
// matching the profile page's card look (white/slate/teal) and the same
// overlay structure the desktop app uses for its own modals
// (AiStatusBadge.tsx: fixed inset-0 backdrop + centered card + header/body/
// footer sections).
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/55 backdrop-blur-[2px] flex items-center justify-center z-50 animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-sm w-full mx-4 overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        </div>
        <div className="p-5">
          <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
        </div>
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm font-semibold text-slate-500 hover:text-slate-800 px-4 py-2 rounded-md transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`text-sm font-semibold text-white px-4 py-2 rounded-md transition-colors cursor-pointer ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-teal-800 hover:bg-teal-900"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
