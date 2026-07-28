"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import type { BackendUser } from "./types";

interface EditUserModalProps {
  user: BackendUser;
  onClose: () => void;
  onSaved: (user: BackendUser) => void;
}

// passwordHash is deliberately never shown/editable here -- credentials stay
// apps/backend's own concern (signup/reset flows), not something office
// mutates directly.
export default function EditUserModal({ user, onClose, onSaved }: EditUserModalProps) {
  const [name, setName] = useState(user.name || "");
  const [email, setEmail] = useState(user.email);
  const [tier, setTier] = useState<"free" | "pro">(user.tier);
  const [image, setImage] = useState(user.image || "");
  const [emailVerified, setEmailVerified] = useState(!!user.emailVerified);
  const [planSelectedAt, setPlanSelectedAt] = useState(user.planSelectedAt ? user.planSelectedAt.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/users?id=${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          tier,
          image: image || null,
          emailVerified: emailVerified ? new Date().toISOString() : null,
          planSelectedAt: planSelectedAt || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update user");
      }

      const { user: updated } = await res.json();
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
          <h2 className="text-lg font-semibold text-slate-800">Edit user</h2>
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

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tier</label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as "free" | "pro")}
              className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none bg-white"
            >
              <option value="free">Free</option>
              <option value="pro">Pro</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Avatar image URL</label>
            <input
              type="text"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://..."
              className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Plan selected at</label>
            <input
              type="date"
              value={planSelectedAt}
              onChange={(e) => setPlanSelectedAt(e.target.value)}
              className="w-full text-sm border border-slate-300 rounded-md px-3 py-2 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={emailVerified}
              onChange={(e) => setEmailVerified(e.target.checked)}
              className="size-4"
            />
            Email verified
          </label>

          <div className="text-xs text-slate-400 border-t border-slate-100 pt-3 space-y-0.5">
            <p>ID: {user.id}</p>
            <p>Created: {new Date(user.createdAt).toLocaleString()}</p>
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
