"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Loader2, UserPlus } from "lucide-react";
import EditAdminModal from "../../../components/admins/EditAdminModal";
import DeleteAdminModal from "../../../components/admins/DeleteAdminModal";
import KebabMenu from "../../../components/KebabMenu";
import type { OfficeAdmin } from "../../../components/admins/types";

// Styling mirrors app/(dashboard)/users/page.tsx, but reads/writes office's
// own admin_users table (via /api/admins, office's own `db`), not
// apps/backend's. "Add admin" moved here (was previously a link inside
// UserMenu's dropdown) -- it still just navigates to the existing /register
// page/flow, unchanged.
export default function AdminsPage() {
  const [admins, setAdmins] = useState<OfficeAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAdmin, setEditingAdmin] = useState<OfficeAdmin | null>(null);
  const [deletingAdmin, setDeletingAdmin] = useState<OfficeAdmin | null>(null);

  async function fetchAdmins() {
    try {
      setLoading(true);
      const res = await fetch("/api/admins");
      if (res.ok) {
        const data = await res.json();
        setAdmins(data.admins || []);
      }
    } catch (err) {
      console.error("Failed to fetch admins:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAdmins();
  }, []);

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-6 py-10 flex flex-col gap-8">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Admins</h1>
          <p className="text-sm text-slate-500">Manage back-office staff accounts (office database).</p>
        </div>
        <Link
          href="/register"
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-md bg-teal-800 hover:bg-teal-900 text-white transition-colors"
        >
          <UserPlus className="size-4" />
          Add admin
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm min-h-[400px]">
        <h2 className="text-lg font-semibold mb-4 text-slate-800 flex items-center gap-2">
          <ShieldCheck className="size-5 text-teal-600" />
          Registered Admins ({admins.length})
        </h2>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
            <Loader2 className="size-8 animate-spin text-teal-700" />
            <span className="text-sm">Loading admins...</span>
          </div>
        ) : admins.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-1 border border-dashed border-slate-200 rounded-lg">
            <ShieldCheck className="size-12 stroke-[1.2] text-slate-300 mb-2" />
            <p className="font-medium text-sm">No admins found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-medium">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-800">{admin.name || "—"}</td>
                    <td className="py-3.5 px-4 text-slate-600">{admin.email}</td>
                    <td className="py-3.5 px-4 text-slate-500 text-xs">
                      {new Date(admin.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <KebabMenu
                        editLabel="Edit admin"
                        deleteLabel="Delete admin"
                        onEdit={() => setEditingAdmin(admin)}
                        onDelete={() => setDeletingAdmin(admin)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingAdmin && (
        <EditAdminModal
          admin={editingAdmin}
          onClose={() => setEditingAdmin(null)}
          onSaved={(updated) => {
            setAdmins((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            setEditingAdmin(null);
          }}
        />
      )}

      {deletingAdmin && (
        <DeleteAdminModal
          admin={deletingAdmin}
          onCancel={() => setDeletingAdmin(null)}
          onDeleted={(id) => {
            setAdmins((prev) => prev.filter((a) => a.id !== id));
            setDeletingAdmin(null);
          }}
        />
      )}
    </div>
  );
}
