"use client";

import { useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import type { BackendUser } from "./types";

interface DeleteUserModalProps {
  user: BackendUser;
  onCancel: () => void;
  onDeleted: (id: string) => void;
}

export default function DeleteUserModal({ user, onCancel, onDeleted }: DeleteUserModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/users?id=${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete user");
      }
      onDeleted(user.id);
    } catch (err: any) {
      setError(err.message || String(err));
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-lg border border-slate-200 p-6">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-full bg-red-50 p-2">
            <TriangleAlert className="size-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Delete user</h2>
            <p className="text-sm text-slate-500 mt-1">
              Delete <span className="font-medium text-slate-700">{user.name || user.email}</span>? This will
              permanently remove their account, sessions, and usage history. This cannot be undone.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200">{error}</div>
        )}

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="text-sm font-medium px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white transition-colors"
          >
            {deleting && <Loader2 className="size-4 animate-spin" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
