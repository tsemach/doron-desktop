"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import type { OfficeAdmin } from "./types";

interface EditAdminModalProps {
  admin: OfficeAdmin;
  onClose: () => void;
  onSaved: (admin: OfficeAdmin) => void;
}

// passwordHash is deliberately never shown/editable here -- password resets
// stay a separate concern (see database/schema.ts's adminUsers comment on
// how these accounts are provisioned).
export default function EditAdminModal({ admin, onClose, onSaved }: EditAdminModalProps) {
  const [name, setName] = useState(admin.name || "");
  const [email, setEmail] = useState(admin.email);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admins?id=${admin.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update admin");
      }

      const { admin: updated } = await res.json();
      onSaved(updated);
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">Edit admin</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600">
            <X className="size-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none"
              required
            />
          </div>

          <div className="text-xs text-slate-400 border-t border-slate-100 pt-3 space-y-0.5">
            <p>ID: {admin.id}</p>
            <p>Created: {new Date(admin.createdAt).toLocaleString()}</p>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="text-sm font-medium px-4 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !email}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 disabled:bg-slate-300 text-white transition-colors"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
